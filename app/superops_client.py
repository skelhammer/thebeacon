import time
import logging
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
        self._ticket_cache = None
        self._ticket_cache_time = 0
        self._agent_cache = None
        self._agent_cache_time = 0

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
        if not force and self._ticket_cache is not None:
            if (now - self._ticket_cache_time) < self.ticket_cache_ttl:
                return self._ticket_cache

        try:
            all_tickets = self._fetch_all_ticket_pages()
            normalized = [self._normalize_ticket(t) for t in all_tickets]
            self._ticket_cache = normalized
            self._ticket_cache_time = time.time()
            logger.info(f"Fetched {len(normalized)} active tickets from SuperOps")
            return normalized
        except Exception as e:
            logger.error(f"Failed to fetch tickets from SuperOps: {e}")
            # Return stale cache if available
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
            'description_text': '',
        }

    def fetch_technicians(self, force=False):
        """Fetch technicians for the agent filter dropdown.

        Returns:
            dict: {userId: name} mapping of active technicians.
        """
        now = time.time()
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

            self._agent_cache = mapping
            self._agent_cache_time = time.time()
            logger.info(f"Fetched {len(mapping)} active technicians from SuperOps")
            return mapping
        except Exception as e:
            logger.error(f"Failed to fetch technicians: {e}")
            if self._agent_cache is not None:
                return self._agent_cache
            return {}

    def invalidate_cache(self):
        """Invalidate all caches, forcing next fetch to hit the API."""
        self._ticket_cache = None
        self._ticket_cache_time = 0
        self._agent_cache = None
        self._agent_cache_time = 0
        logger.info("SuperOps cache invalidated")
