from datetime import datetime, timezone


def as_utc(value: datetime) -> datetime:
    """Return `value` as a timezone-aware UTC datetime.

    SQLite does not store time zones, so datetimes come back "naive". We always store UTC,
    so a naive value is simply UTC without the label.
    """
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)
