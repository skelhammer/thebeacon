import datetime
import time
import logging
import threading
from zoneinfo import ZoneInfo
from concurrent.futures import ThreadPoolExecutor, as_completed
import requests

logger = logging.getLogger(__name__)


class SuperOpsClient:
    """GraphQL client for SuperOps API with TTL caching and pagination."""

    TICKET_FIELDS = """
        ticketId
        displayId
        subject
        status
        priority
        technician
        requester
        client
        techGroup
        createdTime
        updatedTime
        firstResponseDueTime
        firstResponseTime
        firstResponseViolated
        resolutionDueTime
        resolutionTime
        resolutionViolated
        sla
        requestType
    """

    def __init__(self, config):
        superops_cfg = config['superops']
        self.api_url = superops_cfg['api_url']
        self.api_key = superops_cfg['api_key']
        self.subdomain = superops_cfg['customer_subdomain']
        self.page_size = superops_cfg.get('page_size', 100)
        self.ticket_cache_ttl = superops_cfg.get('cache_ttl_seconds', 60)
        self.closed_statuses = config.get('closed_statuses', ['Resolved', 'Closed'])

        agent_cfg = config.get('agents', {})
        self.agent_cache_ttl = agent_cfg.get('cache_ttl_seconds', 300)
        self.closed_counts_cache_ttl = superops_cfg.get('closed_counts_cache_ttl_seconds', 300)
        self.timezone = ZoneInfo(config.get('dashboard', {}).get('timezone', 'America/Los_Angeles'))

        monthly_cfg = config.get('monthly_averages', {})
        self.bh_start = monthly_cfg.get('business_hours_start', 8)
        self.bh_end = monthly_cfg.get('business_hours_end', 17)

        # Caches
        self._cache_lock = threading.Lock()
        self._ticket_cache = None
        self._ticket_cache_time = 0
        self._agent_cache = None
        self._agent_cache_time = 0
        self._conversation_cache = {}  # {ticket_id: {'updated_time': str, 'has_req_reply': bool}}
        self._closed_counts_cache = {}  # {cache_key: {'time': float, 'counts': dict}}
        self._closed_counts_fetching = set()  # cache_keys currently being fetched
        self._avg_response_cache = {}  # {cache_key: {'time': float, 'value': str|None}}
        self._avg_response_fetching = set()  # cache_keys currently being fetched

    def _headers(self):
        return {
            'Authorization': f'Bearer {self.api_key}',
            'Content-Type': 'application/json',
            'CustomerSubDomain': self.subdomain,
        }

    def _post_graphql(self, query, variables=None):
        """Execute a GraphQL query against SuperOps API."""
        payload = {'query': query}
        if variables:
            payload['variables'] = variables

        response = requests.post(
            self.api_url,
            json=payload,
            headers=self._headers(),
            timeout=30
        )
        response.raise_for_status()
        data = response.json()

        if 'errors' in data:
            logger.error(f"GraphQL errors: {data['errors']}")
            raise Exception(f"GraphQL error: {data['errors'][0].get('message', 'Unknown error')}")

        return data.get('data')

    def fetch_tickets(self, force=False):
        """Fetch all active tickets with TTL caching.

        Args:
            force: If True, bypass cache and fetch fresh data.

        Returns:
            list: Normalized ticket dictionaries.
        """
        now = time.time()
        with self._cache_lock:
            if not force and self._ticket_cache is not None:
                if (now - self._ticket_cache_time) < self.ticket_cache_ttl:
                    return self._ticket_cache

        try:
            all_tickets = self._fetch_all_ticket_pages()
            normalized = [self._normalize_ticket(t) for t in all_tickets]
            with self._cache_lock:
                self._ticket_cache = normalized
                self._ticket_cache_time = time.time()
            logger.info(f"Fetched {len(normalized)} active tickets from SuperOps")
            return normalized
        except Exception as e:
            logger.error(f"Failed to fetch tickets from SuperOps: {e}")
            with self._cache_lock:
                if self._ticket_cache is not None:
                    logger.warning("Returning stale cached tickets")
                    return self._ticket_cache
            return []

    def _fetch_all_ticket_pages(self):
        """Fetch all pages of tickets via pagination."""
        all_tickets = []
        page = 1

        query = """
        query getTicketList($input: ListInfoInput!) {
            getTicketList(input: $input) {
                tickets {
                    """ + self.TICKET_FIELDS + """
                }
                listInfo {
                    page
                    pageSize
                    hasMore
                    totalCount
                }
            }
        }
        """

        while True:
            variables = {
                "input": {
                    "page": page,
                    "pageSize": self.page_size,
                    "condition": {
                        "attribute": "status",
                        "operator": "notIncludes",
                        "value": self.closed_statuses,
                    }
                }
            }

            data = self._post_graphql(query, variables) or {}
            result = data.get('getTicketList', {})
            tickets = result.get('tickets', [])
            all_tickets.extend(tickets)

            list_info = result.get('listInfo', {})
            if not list_info.get('hasMore', False):
                break

            page += 1
            # Safety limit to prevent infinite loops
            if page > 50:
                logger.warning("Hit pagination safety limit (50 pages)")
                break

        return all_tickets

    def _normalize_ticket(self, ticket):
        """Normalize SuperOps ticket fields to Beacon-compatible names."""
        # JSON scalar fields return dicts directly
        technician = ticket.get('technician') or {}
        requester = ticket.get('requester') or {}
        client = ticket.get('client') or {}
        tech_group = ticket.get('techGroup') or {}
        sla = ticket.get('sla') or {}

        # Map priority string to numeric for sorting
        priority_text = ticket.get('priority') or 'N/A'
        priority_map = {'Very Low': 0, 'Low': 1, 'Medium': 2, 'High': 3, 'Critical': 4, 'Urgent': 4}
        priority_raw = priority_map.get(priority_text, 0)

        return {
            'id': ticket.get('displayId'),
            'ticket_id': ticket.get('ticketId'),
            'subject': ticket.get('subject') or 'No Subject',
            'status_text': ticket.get('status') or 'Unknown',
            'priority_text': priority_text,
            'priority_raw': priority_raw,
            'agent_name': technician.get('name'),
            'responder_id': str(technician.get('userId', '')) if technician.get('userId') else None,
            'requester_name': requester.get('name') or 'Unknown',
            'client_name': client.get('name'),
            'group_id': str(tech_group.get('groupId', '')) if tech_group.get('groupId') else None,
            'group_name': tech_group.get('name'),
            'type': ticket.get('requestType'),
            'created_at_str': ticket.get('createdTime'),
            'updated_at_str': ticket.get('updatedTime'),
            'fr_due_by_str': ticket.get('firstResponseDueTime'),
            'first_responded_at_iso': ticket.get('firstResponseTime'),
            'first_response_violated': ticket.get('firstResponseViolated', False),
            'due_by_str': ticket.get('resolutionDueTime'),
            'resolution_time': ticket.get('resolutionTime'),
            'resolution_violated': ticket.get('resolutionViolated', False),
            'sla_name': sla.get('name'),
        }

    def fetch_technicians(self, force=False):
        """Fetch technicians for the agent filter dropdown.

        Returns:
            dict: {userId: name} mapping of active technicians.
        """
        now = time.time()
        with self._cache_lock:
            if not force and self._agent_cache is not None:
                if (now - self._agent_cache_time) < self.agent_cache_ttl:
                    return self._agent_cache

        try:
            query = """
            query getTechnicianList($input: ListInfoInput!) {
                getTechnicianList(input: $input) {
                    userList {
                        userId
                        name
                    }
                    listInfo {
                        page
                        pageSize
                        hasMore
                        totalCount
                    }
                }
            }
            """
            # Fetch all technicians (paginate if needed)
            mapping = {}
            page = 1
            while True:
                variables = {
                    "input": {
                        "page": page,
                        "pageSize": 100,
                    }
                }
                data = self._post_graphql(query, variables) or {}
                result = data.get('getTechnicianList', {})
                techs = result.get('userList', [])
                for tech in techs:
                    user_id = tech.get('userId')
                    name = tech.get('name')
                    if user_id and name:
                        mapping[str(user_id)] = name
                list_info = result.get('listInfo', {})
                if not list_info.get('hasMore', False):
                    break
                page += 1
                if page > 50:
                    logger.warning("Hit technician pagination safety limit (50 pages)")
                    break

            with self._cache_lock:
                self._agent_cache = mapping
                self._agent_cache_time = time.time()
            logger.info(f"Fetched {len(mapping)} active technicians from SuperOps")
            return mapping
        except Exception as e:
            logger.error(f"Failed to fetch technicians: {e}")
            with self._cache_lock:
                if self._agent_cache is not None:
                    return self._agent_cache
            return {}

    def check_requester_replies(self, tickets, s2_statuses):
        """Check which tickets have a requester reply as the most recent conversation.

        Uses a smart cache keyed on ticket_id + updatedTime to avoid redundant
        API calls. Skips tickets whose status already qualifies for S2.
        Cache misses are fetched concurrently (10 workers) to avoid blocking.

        Args:
            tickets: List of normalized ticket dicts.
            s2_statuses: Set of lowercased status strings that route to S2.

        Returns:
            set: ticket_ids that have a requester reply as the last conversation.
        """
        active_ticket_ids = set()
        reply_ticket_ids = set()
        to_fetch = []  # (ticket_id, updated_time, cached_entry)

        query = """
        query getTicketConversationList($input: TicketIdentifierInput!) {
            getTicketConversationList(input: $input) {
                type
            }
        }
        """

        for ticket in tickets:
            ticket_id = ticket.get('ticket_id')
            if not ticket_id:
                continue
            active_ticket_ids.add(ticket_id)

            status = (ticket.get('status_text') or '').lower()
            if status in s2_statuses:
                continue

            updated_time = ticket.get('updated_at_str') or ''
            cached = self._conversation_cache.get(ticket_id)

            if cached and cached['updated_time'] == updated_time:
                if cached['has_req_reply']:
                    reply_ticket_ids.add(ticket_id)
                continue

            to_fetch.append((ticket_id, updated_time, cached))

        # Fetch cache misses concurrently
        if to_fetch:
            logger.info(f"Fetching conversations for {len(to_fetch)} tickets")

            def _fetch_one(ticket_id, updated_time):
                variables = {"input": {"ticketId": ticket_id}}
                data = self._post_graphql(query, variables) or {}
                conversations = data.get('getTicketConversationList') or []
                return bool(conversations) and conversations[-1].get('type') == 'REQ_REPLY'

            with ThreadPoolExecutor(max_workers=10) as executor:
                futures = {
                    executor.submit(_fetch_one, tid, ut): (tid, ut, cached_entry)
                    for tid, ut, cached_entry in to_fetch
                }
                for future in as_completed(futures):
                    tid, ut, cached_entry = futures[future]
                    try:
                        has_reply = future.result()
                        with self._cache_lock:
                            self._conversation_cache[tid] = {
                                'updated_time': ut,
                                'has_req_reply': has_reply,
                            }
                        if has_reply:
                            reply_ticket_ids.add(tid)
                    except Exception as e:
                        logger.warning(f"Failed to fetch conversations for ticket {tid}: {e}")
                        if cached_entry and cached_entry.get('has_req_reply'):
                            reply_ticket_ids.add(tid)

        # Clean stale cache entries for tickets no longer in the full ticket cache
        with self._cache_lock:
            if self._ticket_cache is not None:
                all_ticket_ids = set(t.get('ticket_id') for t in self._ticket_cache if t.get('ticket_id'))
                stale_ids = set(self._conversation_cache.keys()) - all_ticket_ids
                for stale_id in stale_ids:
                    del self._conversation_cache[stale_id]
                if stale_ids:
                    logger.debug(f"Cleaned {len(stale_ids)} stale conversation cache entries")

        return reply_ticket_ids

    def fetch_closed_counts(self, view_slug='', view_config=None, agent_id=None, force=False):
        """Fetch counts of tickets closed today and this week.

        Non-blocking on initial page load (returns None counts and fetches in
        background). On auto-refresh (force=True), fetches synchronously so the
        UI always gets fresh data.

        Args:
            view_slug: View slug string for stable cache key.
            view_config: Optional view config dict for tech group filtering.
            agent_id: Optional agent ID to filter by.
            force: If True, bypass cache and fetch synchronously.

        Returns:
            dict: {'today': int, 'this_week': int} or {'today': None, 'this_week': None} if not yet cached.
        """
        cache_key = f"{view_slug}:{agent_id or ''}"
        now = time.time()

        if not force:
            with self._cache_lock:
                cached = self._closed_counts_cache.get(cache_key)
                if cached and (now - cached['time']) < self.closed_counts_cache_ttl:
                    return cached['counts']

                # Already fetching in background — don't spawn another thread
                if cache_key in self._closed_counts_fetching:
                    # Return stale cached data if available, else None
                    if cached:
                        return cached['counts']
                    return {'today': None, 'this_week': None}

                self._closed_counts_fetching.add(cache_key)

        def _do_fetch():
            try:
                closed_tickets = self._fetch_closed_tickets_recent()

                # Apply view filtering if configured
                if view_config:
                    target_group_ids = view_config.get('tech_group_ids', [])
                    exclude_group_ids = view_config.get('exclude_tech_group_ids', [])
                    if exclude_group_ids:
                        exclude_set = set(exclude_group_ids)
                        closed_tickets = [t for t in closed_tickets if t.get('group_id') not in exclude_set]
                    elif target_group_ids:
                        target_set = set(target_group_ids)
                        closed_tickets = [t for t in closed_tickets if t.get('group_id') in target_set]

                # Apply agent filtering
                if agent_id:
                    agent_id_str = str(agent_id)
                    closed_tickets = [t for t in closed_tickets if str(t.get('responder_id', '')) == agent_id_str]

                # Compute date boundaries in configured timezone
                local_now = datetime.datetime.now(self.timezone)
                today_start = local_now.replace(hour=0, minute=0, second=0, microsecond=0)
                days_since_monday = local_now.weekday()  # 0=Monday
                week_start = (local_now - datetime.timedelta(days=days_since_monday)).replace(
                    hour=0, minute=0, second=0, microsecond=0
                )

                count_today = 0
                count_week = 0
                for ticket in closed_tickets:
                    updated_str = ticket.get('updated_at_str')
                    if not updated_str:
                        continue
                    try:
                        updated_dt = self._parse_closed_datetime(updated_str)
                        if updated_dt >= today_start:
                            count_today += 1
                        if updated_dt >= week_start:
                            count_week += 1
                    except (ValueError, TypeError):
                        continue

                counts = {'today': count_today, 'this_week': count_week}
                with self._cache_lock:
                    self._closed_counts_cache[cache_key] = {'time': time.time(), 'counts': counts}
                logger.info(f"Closed counts: today={count_today}, this_week={count_week}")
                return counts

            except Exception as e:
                logger.error(f"Failed to fetch closed ticket counts: {e}")
                return None
            finally:
                with self._cache_lock:
                    self._closed_counts_fetching.discard(cache_key)

        # Synchronous fetch on force refresh (auto-refresh) so counts are always fresh
        if force:
            result = _do_fetch()
            if result:
                return result
            # Fall back to cached data if fetch failed
            with self._cache_lock:
                cached = self._closed_counts_cache.get(cache_key)
                if cached:
                    return cached['counts']
            return {'today': None, 'this_week': None}

        # Non-blocking on initial page load
        thread = threading.Thread(target=_do_fetch, daemon=True)
        thread.start()

        return {'today': None, 'this_week': None}

    def fetch_monthly_averages(self, view_slug='', tech_group_ids=None, force=False):
        """Fetch average first response time and average close time (rolling 30 days).

        Same non-blocking/sync pattern as fetch_closed_counts().

        Args:
            view_slug: View slug string for stable cache key.
            tech_group_ids: List of tech group IDs to include. If empty/None, includes all.
            force: If True, bypass cache and fetch synchronously.

        Returns:
            dict: {'avg_response_mins': str|None, 'avg_close_hours': str|None}
        """
        empty = {'avg_response_mins': None, 'avg_close_hours': None}
        cache_key = f"avg_monthly:{view_slug}"
        now = time.time()

        if not force:
            with self._cache_lock:
                cached = self._avg_response_cache.get(cache_key)
                if cached and (now - cached['time']) < self.closed_counts_cache_ttl:
                    return cached['value']

                if cache_key in self._avg_response_fetching:
                    if cached:
                        return cached['value']
                    return empty

                self._avg_response_fetching.add(cache_key)

        def _do_fetch():
            try:
                target_set = set(tech_group_ids) if tech_group_ids else None
                cutoff_30d = datetime.datetime.now(self.timezone) - datetime.timedelta(days=30)

                # --- Avg First Response: all tickets CREATED in last 30 days ---
                # Includes both open and closed tickets
                active_tickets = self.fetch_tickets() or []
                closed_tickets = self._fetch_closed_tickets_recent()
                all_tickets = []

                # Normalize active tickets to same shape for FR calculation
                for t in active_tickets:
                    if target_set and t.get('group_id') not in target_set:
                        continue
                    created_str = t.get('created_at_str')
                    if not created_str:
                        continue
                    try:
                        created_dt = self._parse_closed_datetime(created_str)
                        if created_dt < cutoff_30d:
                            continue
                    except (ValueError, TypeError):
                        continue
                    all_tickets.append({
                        'created_at_str': created_str,
                        'first_response_time_str': t.get('first_responded_at_iso'),
                    })

                # Add closed tickets created in last 30 days
                for t in closed_tickets:
                    if target_set and t.get('group_id') not in target_set:
                        continue
                    created_str = t.get('created_at_str')
                    if not created_str:
                        continue
                    try:
                        created_dt = self._parse_closed_datetime(created_str)
                        if created_dt < cutoff_30d:
                            continue
                    except (ValueError, TypeError):
                        continue
                    all_tickets.append({
                        'created_at_str': created_str,
                        'first_response_time_str': t.get('first_response_time_str'),
                    })

                fr_deltas = []
                for ticket in all_tickets:
                    fr_str = ticket.get('first_response_time_str')
                    created_str = ticket.get('created_at_str')
                    if not fr_str or not created_str:
                        continue
                    try:
                        created_dt = self._parse_closed_datetime(created_str)
                        fr_dt = self._parse_closed_datetime(fr_str)
                        fr_delta = self._business_hours_between(created_dt, fr_dt)
                        if fr_delta >= 0:
                            fr_deltas.append(fr_delta)
                    except (ValueError, TypeError):
                        continue

                # --- Avg Resolution: closed tickets CLOSED in last 30 days ---
                close_deltas = []
                for t in closed_tickets:
                    if target_set and t.get('group_id') not in target_set:
                        continue
                    updated_str = t.get('updated_at_str')
                    created_str = t.get('created_at_str')
                    res_str = t.get('resolution_time_str')
                    if not updated_str or not created_str or not res_str:
                        continue
                    try:
                        updated_dt = self._parse_closed_datetime(updated_str)
                        if updated_dt < cutoff_30d:
                            continue
                        created_dt = self._parse_closed_datetime(created_str)
                        res_dt = self._parse_closed_datetime(res_str)
                        close_delta = self._business_hours_between(created_dt, res_dt)
                        if close_delta >= 0:
                            close_deltas.append(close_delta)
                    except (ValueError, TypeError):
                        continue

                # Format results
                avg_response_mins = None
                if fr_deltas:
                    avg_secs = sum(fr_deltas) / len(fr_deltas)
                    avg_hrs = int(avg_secs // 3600)
                    avg_mins = int((avg_secs % 3600) // 60)
                    if avg_hrs > 0:
                        avg_response_mins = f"{avg_hrs}h {avg_mins}m"
                    else:
                        avg_response_mins = f"{avg_mins}m"

                avg_close_hours = None
                if close_deltas:
                    avg_secs = sum(close_deltas) / len(close_deltas)
                    avg_hrs = avg_secs / 3600
                    if avg_hrs >= 24:
                        days = int(avg_hrs // 24)
                        hours = avg_hrs % 24
                        avg_close_hours = f"{days}d {hours:.0f}h"
                    else:
                        avg_close_hours = f"{avg_hrs:.1f}h"

                value = {
                    'avg_response_mins': avg_response_mins,
                    'avg_close_hours': avg_close_hours,
                }

                with self._cache_lock:
                    self._avg_response_cache[cache_key] = {'time': time.time(), 'value': value}
                logger.info(
                    f"Monthly averages: response={avg_response_mins} ({len(fr_deltas)} tickets), "
                    f"close={avg_close_hours} ({len(close_deltas)} tickets)"
                )
                return value

            except Exception as e:
                logger.error(f"Failed to compute monthly averages: {e}")
                return None
            finally:
                with self._cache_lock:
                    self._avg_response_fetching.discard(cache_key)

        if force:
            result = _do_fetch()
            if result is not None:
                return result
            with self._cache_lock:
                cached = self._avg_response_cache.get(cache_key)
                if cached:
                    return cached['value']
            return empty

        thread = threading.Thread(target=_do_fetch, daemon=True)
        thread.start()
        return empty

    def _fetch_closed_tickets_recent(self):
        """Fetch recently closed tickets (last 8 days).

        Sorts by updatedTime descending so the most recently closed tickets come
        first, then stops paginating once an entire page falls outside the cutoff.
        This gives consistent, complete results regardless of total closed ticket count.
        """
        all_tickets = []
        page = 1
        cutoff = datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(days=32)

        query = """
        query getTicketList($input: ListInfoInput!) {
            getTicketList(input: $input) {
                tickets {
                    ticketId
                    displayId
                    status
                    createdTime
                    updatedTime
                    firstResponseTime
                    resolutionTime
                    technician
                    techGroup
                }
                listInfo {
                    page
                    pageSize
                    hasMore
                    totalCount
                }
            }
        }
        """

        while True:
            variables = {
                "input": {
                    "page": page,
                    "pageSize": self.page_size,
                    "sort": [{"attribute": "updatedTime", "order": "DESC"}],
                    "condition": {
                        "attribute": "status",
                        "operator": "includes",
                        "value": self.closed_statuses,
                    },
                }
            }

            data = self._post_graphql(query, variables) or {}
            result = data.get('getTicketList', {})
            tickets = result.get('tickets', [])

            if not tickets:
                break

            page_has_recent = False
            for ticket in tickets:
                normalized = self._normalize_closed_ticket(ticket)
                updated_str = normalized.get('updated_at_str')
                if updated_str:
                    try:
                        updated_dt = self._parse_closed_datetime(updated_str)
                        if updated_dt >= cutoff:
                            all_tickets.append(normalized)
                            page_has_recent = True
                    except (ValueError, TypeError):
                        pass

            # If sorted desc and no ticket on this page was recent, all
            # subsequent pages will be older — stop early.
            if not page_has_recent:
                logger.debug(f"Closed ticket pagination: stopped at page {page} (all tickets older than cutoff)")
                break

            list_info = result.get('listInfo', {})
            if not list_info.get('hasMore', False):
                break

            page += 1
            if page > 100:
                logger.warning("Hit closed ticket pagination safety limit (100 pages)")
                break

        logger.debug(f"Fetched {len(all_tickets)} closed tickets from last 32 days across {page} pages")
        return all_tickets

    @staticmethod
    def _normalize_closed_ticket(ticket):
        """Normalize a closed ticket with minimal fields."""
        technician = ticket.get('technician') or {}
        tech_group = ticket.get('techGroup') or {}
        return {
            'ticket_id': ticket.get('ticketId'),
            'id': ticket.get('displayId'),
            'status_text': ticket.get('status') or 'Unknown',
            'created_at_str': ticket.get('createdTime'),
            'updated_at_str': ticket.get('updatedTime'),
            'first_response_time_str': ticket.get('firstResponseTime'),
            'resolution_time_str': ticket.get('resolutionTime'),
            'responder_id': str(technician.get('userId', '')) if technician.get('userId') else None,
            'group_id': str(tech_group.get('groupId', '')) if tech_group.get('groupId') else None,
        }

    @staticmethod
    def _parse_closed_datetime(dt_str):
        """Parse a datetime string for closed ticket comparison."""
        if not dt_str:
            raise ValueError("Empty datetime string")
        dt_str = dt_str.strip()
        if dt_str.endswith('Z'):
            dt_str = dt_str[:-1] + '+00:00'
        try:
            dt = datetime.datetime.fromisoformat(dt_str)
        except ValueError:
            for fmt in ('%Y-%m-%dT%H:%M:%S', '%Y-%m-%d %H:%M:%S', '%Y-%m-%dT%H:%M:%S.%f'):
                try:
                    dt = datetime.datetime.strptime(dt_str, fmt)
                    break
                except ValueError:
                    continue
            else:
                raise ValueError(f"Unable to parse datetime: {dt_str}")
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=datetime.timezone.utc)
        return dt

    def _business_hours_between(self, start_dt, end_dt):
        """Calculate seconds of business hours between two datetimes.

        Business hours: Monday-Friday in configured timezone.
        Start/end hours from config (default 8 AM - 5 PM).
        Timestamps outside business hours are clamped to the nearest boundary.
        """
        BH_START = self.bh_start
        BH_END = self.bh_end

        # Convert to configured timezone
        start = start_dt.astimezone(self.timezone)
        end = end_dt.astimezone(self.timezone)

        if end <= start:
            return 0.0

        total_seconds = 0.0
        current = start

        # Iterate day by day
        while current < end:
            # Skip weekends
            if current.weekday() >= 5:
                current = (current + datetime.timedelta(days=1)).replace(
                    hour=BH_START, minute=0, second=0, microsecond=0
                )
                continue

            day_start = current.replace(hour=BH_START, minute=0, second=0, microsecond=0)
            day_end = current.replace(hour=BH_END, minute=0, second=0, microsecond=0)

            # Clamp current and end to business hours for this day
            effective_start = max(current, day_start)
            effective_end = min(end, day_end)

            if effective_start < effective_end:
                total_seconds += (effective_end - effective_start).total_seconds()

            # Move to next business day
            current = (current + datetime.timedelta(days=1)).replace(
                hour=BH_START, minute=0, second=0, microsecond=0
            )

        return total_seconds

    def invalidate_cache(self):
        """Invalidate all caches, forcing next fetch to hit the API."""
        self._ticket_cache = None
        self._ticket_cache_time = 0
        self._agent_cache = None
        self._agent_cache_time = 0
        self._conversation_cache = {}
        self._closed_counts_cache = {}
        self._closed_counts_fetching = set()
        self._avg_response_cache = {}
        self._avg_response_fetching = set()
        logger.info("SuperOps cache invalidated")
