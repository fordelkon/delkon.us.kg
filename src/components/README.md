# Components

Presentation components for the site, filed by role.

## Filing rules

- `printed/` owns the printer-metaphor drawing: the housing, the paper viewport, and receipt markup. Examples: [PaperViewport.astro](printed/PaperViewport.astro), [PrinterHousing.astro](printed/PrinterHousing.astro), [PrintedSection.astro](printed/PrintedSection.astro), [PrintedDivider.astro](printed/PrintedDivider.astro).
- `layout/` composes the site shell: [Header.astro](layout/Header.astro) and [Footer.astro](layout/Footer.astro). Shell-adjacent widgets the shell composes (theme, search, navigation) also live here or at the root.
- `blog/` and `note/` hold feature presentation for their content type, such as [Masthead.astro](blog/Masthead.astro) and [Note.astro](note/Note.astro).
- The root holds shared primitives used across features and site-wide widgets, such as [Paginator.astro](Paginator.astro), [Search.astro](Search.astro), and [ThemeProvider.astro](ThemeProvider.astro).
- Route-local helpers stay beside their route (for example, the OG image markup helper in [src/pages/og-image/](../pages/og-image/)).

There is no `shell/` directory: single-consumer shell widgets stay in `layout/` or at the root rather than gaining an extra level.
