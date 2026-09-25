# Spec Delta

## Purpose

Lets staff judge files at a glance in the finder and on the detail page with real previews instead of file names alone, while withheld files stay protected.

## ADDED Requirements

### Requirement: Vorschau in Inspektor und Detail

The system SHALL render an inline preview for image files and an embedded preview for PDF files in the finder inspector and on the staff request detail page, served through the existing authenticated file endpoints, with a fallback (icon plus meta) for other types and load failures.

#### Scenario: Bild und PDF sichtbar

- **WHEN** staff inspect a request containing a JPG and a PDF
- **THEN** the JPG renders inline and the PDF renders embedded without leaving the page.

#### Scenario: Zurückbehalten bleibt ohne Vorschau

- **WHEN** a file is withheld by the security verdict
- **THEN** no preview control is offered and the security reasons are shown instead.

### Requirement: Keine Byte-Links für Unbefugte

The system SHALL NOT expose preview URLs beyond the existing authenticated endpoints, and preview requests SHALL enforce the same servability rules as downloads.

#### Scenario: Direktabruf bleibt geschützt

- **WHEN** an unauthenticated client requests a preview URL
- **THEN** access is denied exactly as for downloads.
