"""Typed errors at the specifyr boundary."""


class SpecifyrError(Exception):
    """Base class for invalid input or contracts."""


class ContractError(SpecifyrError):
    """A versioned input document violates its contract."""


class AdapterError(SpecifyrError):
    """An adapter cannot deterministically consume its input."""

