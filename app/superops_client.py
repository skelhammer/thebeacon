import time
import logging
import threading
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

        # Caches
        self._cache_lock = threading.Lock()
        self._ticket_cache = None
        self._ticket_cache_time = 0
        self._agent_cache = None
        self._agent_cache_time = 0
        self._conversation_cache = {}  # {ticket_id: {'updated_time': str, 'has_req_reply': bool}}

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

            data = self._post_graphql(query, variables)
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
                data = self._post_graphql(query, variables)
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
                data = self._post_graphql(query, variables)
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

    def invalidate_cache(self):
        """Invalidate all caches, forcing next fetch to hit the API."""
        self._ticket_cache = None
        self._ticket_cache_time = 0
        self._agent_cache = None
        self._agent_cache_time = 0
        self._conversation_cache = {}
        logger.info("SuperOps cache invalidated")
