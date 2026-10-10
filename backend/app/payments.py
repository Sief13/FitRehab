"""The payment 'provider'.

This project uses a SANDBOX provider: it behaves like a payment gateway in test mode
(hosted checkout, test cards, success / decline) but never moves real money, and it only
accepts the well-known test card numbers below.

Everything provider-specific is in `charge_sandbox_card`. To use a real gateway later
(Stripe, Paymob, Paystack...), replace that one function with a call to the provider's API
and let the provider's checkout page collect the card, so card numbers never touch our server.
"""

import re
from dataclasses import dataclass


class NotATestCard(ValueError):
    pass


@dataclass(frozen=True)
class ChargeResult:
    ok: bool
    last4: str
    failure: str | None = None


# card number -> failure message (None means the payment succeeds)
TEST_CARDS: dict[str, str | None] = {
    "4242424242424242": None,
    "4000000000000002": "Your card was declined.",
    "4000000000009995": "Your card has insufficient funds.",
}


def charge_sandbox_card(card_number: str) -> ChargeResult:
    digits = re.sub(r"[\s-]", "", card_number)
    if digits not in TEST_CARDS:
        raise NotATestCard("This is a sandbox: only test cards are accepted. Use 4242 4242 4242 4242.")
    failure = TEST_CARDS[digits]
    return ChargeResult(ok=failure is None, last4=digits[-4:], failure=failure)
