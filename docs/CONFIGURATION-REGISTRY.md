# Configuration Schema and Registry 2.0

## Purpose

The platform must discover products from validated runtime definitions rather than from a TypeScript union or ad hoc array lookup.

## Flow

`unknown input → parsePlatformConfig → ProductRegistry → orchestrator / HTTP API`

## Validation rules

A product definition must contain:

- a lowercase kebab-case `id`;
- a non-empty `name`;
- a status of `active`, `planned`, or `parked`;
- only capabilities known by the core;
- no duplicate capabilities.

A platform configuration must contain a product array with unique product IDs.

## Registry guarantees

`ProductRegistry`:

- validates all input during construction;
- stores products by ID for deterministic lookup;
- copies and freezes internal definitions;
- returns defensive copies to callers;
- keeps independent registry instances isolated.

## Compatibility

The module continues exporting `products`, `capabilities`, and `getProduct()` so the current HTTP server and orchestrator remain compatible while using the validated registry internally.

## Deliberate exclusions

This phase does not include remote configuration, databases, secrets, feature flags, dynamic code loading, product datasets, or an administrative interface.
