import datetime
import logging

logger = logging.getLogger(__name__)


def map_tickets_to_sections(tickets, config):
    """Assign tickets to 4 dashboard sections based on status mapping.

    Priority order:
    - Section 3 (Needs Agent / Overdue): SLA violated tickets checked first
    - Section 1 (Open): New/unresponded tickets
    - Section 2 (Customer Replied): Awaiting agent response
    - Section 4 (Other Active): Everything else

    Args:
        tickets: List of normalized ticket dicts.
        config: Full config dict with status_mapping.

    Returns:
        tuple: (section1, section2, section3, section4) lists.
    """
    mapping = config.get('status_mapping', {})
    s1_cfg = mapping.get('open', {})
    s2_cfg = mapping.get('customer_replied', {})
    s3_cfg = mapping.get('needs_agent', {})
    s4_cfg = mapping.get('other_active', {})

    s1_statuses = set(s.lower() for s in s1_cfg.get('statuses', []))
    s2_statuses = set(s.lower() for s in s2_cfg.get('statuses', []))
    s3_statuses = set(s.lower() for s in s3_cfg.get('statuses', []))
    s4_statuses = set(s.lower() for s in s4_cfg.get('statuses', []))

    s1, s2, s3, s4 = [], [], [], []

    for ticket in tickets:
        # Compute SLA and time fields for every ticket
        compute_sla_fields(ticket)

        status = (ticket.get('status_text') or '').lower()
        has_first_response = bool(ticket.get('first_responded_at_iso'))
        is_sla_violated = ticket.get('first_response_violated') or ticket.get('resolution_violated')
        is_unassigned = not ticket.get('agent_name')

        # Section 3: Check first - SLA violated or specific statuses
        if s3_cfg.get('include_sla_violated') and is_sla_violated:
            s3.append(ticket)
        elif status in s3_statuses:
            s3.append(ticket)
        # Section 1: Open / no first response / unassigned
        elif status in s1_statuses:
            s1.append(ticket)
        elif s1_cfg.get('include_no_first_response') and not has_first_response and status not in s2_statuses:
            s1.append(ticket)
        elif s1_cfg.get('include_unassigned') and is_unassigned and status not in s2_statuses:
            s1.append(ticket)
        # Section 2: Customer replied
        elif status in s2_statuses:
            s2.append(ticket)
        # Section 4: Catch-all for remaining active tickets
        elif status in s4_statuses:
            s4.append(ticket)
        else:
            # True catch-all for statuses not in any mapping
            s4.append(ticket)

    return s1, s2, s3, s4


def filter_by_view(tickets, view_config, all_views_config):
    """Filter tickets by tech group IDs for a specific view.

    Args:
        tickets: List of ticket dicts.
        view_config: Config for the selected view (has tech_group_ids).
        all_views_config: Config for all views (to determine exclusions).

    Returns:
        list: Filtered tickets.
    """
    target_group_ids = view_config.get('tech_group_ids', [])

    # If no group IDs configured for this view, we need to determine behavior
    if not target_group_ids:
        # Collect group IDs from ALL other views
        other_group_ids = set()
        for slug, vcfg in all_views_config.items():
            ids = vcfg.get('tech_group_ids', [])
            if ids and ids != target_group_ids:
                other_group_ids.update(ids)

        if other_group_ids:
            # Show tickets NOT in any other view's groups (default/catch-all view)
            return [t for t in tickets if t.get('group_id') not in other_group_ids]
        else:
            # No other view has groups configured, show all
            return tickets

    # Filter to only tickets in this view's group IDs
    target_set = set(target_group_ids)
    return [t for t in tickets if t.get('group_id') in target_set]


def filter_by_agent(tickets, agent_id):
    """Filter tickets to only those assigned to a specific agent.

    Args:
        tickets: List of ticket dicts.
        agent_id: The technician userId to filter by.

    Returns:
        list: Filtered tickets.
    """
    if not agent_id:
        return tickets

    # Handle string/int comparison
    try:
        agent_id_cmp = int(agent_id) if not isinstance(agent_id, int) else agent_id
    except (ValueError, TypeError):
        return tickets

    return [t for t in tickets if t.get('responder_id') == agent_id_cmp]


def compute_sla_fields(ticket):
    """Compute SLA display text, CSS class, and friendly time fields.

    Mutates the ticket dict in place, adding:
    - sla_text: Human-readable SLA status
    - sla_class: CSS class for styling
    - updated_friendly: "2 hours ago" style text
    - created_days_old: "5 days" style text
    """
    now = datetime.datetime.now(datetime.timezone.utc)

    # Compute updated_friendly
    updated_str = ticket.get('updated_at_str')
    if updated_str:
        try:
            updated_dt = _parse_datetime(updated_str)
            ticket['updated_friendly'] = _friendly_timedelta(now - updated_dt)
        except (ValueError, TypeError):
            ticket['updated_friendly'] = 'N/A'
    else:
        ticket['updated_friendly'] = 'N/A'

    # Compute created_days_old
    created_str = ticket.get('created_at_str')
    if created_str:
        try:
            created_dt = _parse_datetime(created_str)
            delta = now - created_dt
            days = delta.days
            if days == 0:
                ticket['created_days_old'] = 'Today'
            elif days == 1:
                ticket['created_days_old'] = '1 day'
            else:
                ticket['created_days_old'] = f'{days} days'
        except (ValueError, TypeError):
            ticket['created_days_old'] = 'N/A'
    else:
        ticket['created_days_old'] = 'N/A'

    # Compute SLA status
    has_first_response = bool(ticket.get('first_responded_at_iso'))
    fr_violated = ticket.get('first_response_violated', False)
    res_violated = ticket.get('resolution_violated', False)
    fr_due_str = ticket.get('fr_due_by_str')
    status_text = ticket.get('status_text', '')

    # If already responded and not violated
    if has_first_response and not res_violated:
        ticket['sla_text'] = status_text
        ticket['sla_class'] = 'sla-responded'
        return

    # If SLA violated
    if fr_violated or res_violated:
        ticket['sla_text'] = 'SLA Violated'
        ticket['sla_class'] = 'sla-overdue'
        return

    # Check first response due time
    if not has_first_response and fr_due_str:
        try:
            fr_due_dt = _parse_datetime(fr_due_str)
            remaining = fr_due_dt - now
            total_minutes = remaining.total_seconds() / 60

            if total_minutes < 0:
                ticket['sla_text'] = 'FR Overdue'
                ticket['sla_class'] = 'sla-overdue'
            elif total_minutes < 30:
                ticket['sla_text'] = 'FR Critical'
                ticket['sla_class'] = 'sla-critical'
            elif total_minutes < 120:
                ticket['sla_text'] = 'FR Warning'
                ticket['sla_class'] = 'sla-warning'
            else:
                ticket['sla_text'] = 'FR OK'
                ticket['sla_class'] = 'sla-normal'
            return
        except (ValueError, TypeError):
            pass

    # Default: show status
    ticket['sla_text'] = status_text
    ticket['sla_class'] = 'sla-none'


def _parse_datetime(dt_str):
    """Parse an ISO datetime string to a timezone-aware datetime."""
    if not dt_str:
        raise ValueError("Empty datetime string")

    dt_str = dt_str.strip()

    # Handle various ISO formats
    if dt_str.endswith('Z'):
        dt_str = dt_str[:-1] + '+00:00'

    try:
        return datetime.datetime.fromisoformat(dt_str)
    except ValueError:
        # Try common formats
        for fmt in ('%Y-%m-%dT%H:%M:%S', '%Y-%m-%d %H:%M:%S', '%Y-%m-%dT%H:%M:%S.%f'):
            try:
                dt = datetime.datetime.strptime(dt_str, fmt)
                return dt.replace(tzinfo=datetime.timezone.utc)
            except ValueError:
                continue
        raise ValueError(f"Unable to parse datetime: {dt_str}")


def _friendly_timedelta(delta):
    """Convert a timedelta to a human-friendly string."""
    total_seconds = int(delta.total_seconds())
    if total_seconds < 0:
        return 'Just now'

    minutes = total_seconds // 60
    hours = minutes // 60
    days = hours // 24

    if days > 0:
        return f'{days}d ago' if days <= 30 else f'{days // 30}mo ago'
    elif hours > 0:
        return f'{hours}h ago'
    elif minutes > 0:
        return f'{minutes}m ago'
    else:
        return 'Just now'
