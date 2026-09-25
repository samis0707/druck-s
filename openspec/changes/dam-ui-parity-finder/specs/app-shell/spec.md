# Spec Delta

## Purpose

Provides one shared visual shell so every page feels like the same portal with consistent navigation, feedback, and legal reachability.

## ADDED Requirements

### Requirement: Centralized shell layout

The system SHALL render a shared shell on every page consisting of a header with brand plus primary navigation, page content, and a central footer, with a single toast provider mounted once in the root layout.

#### Scenario: Every page shows header and footer

- **WHEN** a user visits `/`, `/upload`, `/requests`, or any `/staff` page
- **THEN** the header with brand and navigation and the footer with legal links are visible without per-page duplication.

#### Scenario: Single toast system

- **WHEN** any client action reports success or failure
- **THEN** the message appears through the single Base-UI toast provider using German wording.

### Requirement: Header navigation with mobile behavior

The system SHALL show primary navigation (Upload, Requests/Aufträge, Staff) with active-link indication and session-aware actions, collapsing to a burger-plus-sheet navigation below the desktop breakpoint with the same links and actions.

#### Scenario: Desktop navigation marks active page

- **WHEN** a user is on `/staff`
- **THEN** the Staff link is visually marked active and the other links are not.

#### Scenario: Mobile navigation remains fully usable

- **WHEN** the viewport is below the desktop breakpoint
- **THEN** navigation is reachable through a burger button opening a sheet containing all links and session actions, operable by keyboard and touch.

### Requirement: Page header pattern

The system SHALL render content pages inside a shared page shell with a page header containing breadcrumb, title, description, and an action slot with at most one primary call-to-action.

#### Scenario: Staff triage header guides the task

- **WHEN** staff open the request overview
- **THEN** they see breadcrumb, the title, a one-line description of the triage task, and the secondary action for customers and links.

### Requirement: Central legal footer

The system SHALL expose Kontakt, Impressum, Datenschutz, AGB, and Widerruf links from the central footer on every page, with each target served from a shared legal route group using one layout.

#### Scenario: Legal pages reachable from anywhere

- **WHEN** a user clicks Impressum in the footer from any page
- **THEN** the imprint page opens and its own footer still links back to all other legal pages.

### Requirement: Single design token and component system

The system SHALL use one Shadcn/Base-UI component set with semantic color tokens, a fixed radius scale, and an elevation scale, and SHALL NOT maintain parallel hand-rolled button, badge, card, or feedback variants.

#### Scenario: No parallel button worlds

- **WHEN** any page renders buttons or badges
- **THEN** only the shared Shadcn button and badge variants are used with semantic tokens and no hardcoded palette values.
