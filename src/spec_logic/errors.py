"""Typed errors at the spec-logic boundary."""


class SpecLogicError(Exception):
    """Base class for invalid input or contracts."""


class ContractError(SpecLogicError):
    """A versioned input document violates its contract."""


class AdapterError(SpecLogicError):
    """An adapter cannot deterministically consume its input."""

