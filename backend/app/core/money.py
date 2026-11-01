from decimal import Decimal, ROUND_HALF_UP


def divide_round(total: int, count: int) -> int:
    """Round a paise total / count to the nearest paise (half up)."""
    if count <= 0:
        return 0
    value = Decimal(total) / Decimal(count)
    return int(value.quantize(Decimal("1"), rounding=ROUND_HALF_UP))


def percent(part: int, whole: int, places: str = "0.1") -> float:
    """Percentage rounded to one decimal place; 0 when the whole is zero."""
    if whole <= 0:
        return 0.0
    value = (Decimal(part) * Decimal(100)) / Decimal(whole)
    return float(value.quantize(Decimal(places), rounding=ROUND_HALF_UP))


def change_percent(current: int, previous: int) -> float | None:
    """Percentage change. None when there is no meaningful baseline."""
    if previous == 0:
        return None
    value = (Decimal(current - previous) * Decimal(100)) / Decimal(previous)
    return float(value.quantize(Decimal("0.1"), rounding=ROUND_HALF_UP))


def format_inr(paise: int) -> str:
    """Format paise using Indian digit grouping, e.g. ₹1,25,000.00."""
    negative = paise < 0
    whole, fraction = divmod(abs(int(paise)), 100)
    digits = str(whole)
    if len(digits) > 3:
        last_three = digits[-3:]
        rest = digits[:-3]
        groups: list[str] = []
        while len(rest) > 2:
            groups.insert(0, rest[-2:])
            rest = rest[:-2]
        if rest:
            groups.insert(0, rest)
        digits = ",".join(groups + [last_three])
    sign = "-" if negative else ""
    return f"{sign}₹{digits}.{fraction:02d}"
