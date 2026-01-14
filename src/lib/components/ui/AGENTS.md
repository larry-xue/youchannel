# UI COMPONENTS (src/lib/components/ui)

## OVERVIEW

Core design system based on **Shadcn UI** primitives, customized for **Material Design 3** aesthetics. Uses **Tailwind CSS v4** and **Lucide React**.

## CONVENTIONS

- **Utils**: Always use `cn()` from `~/lib/utils` for class merging.
- **Styling (MD3)**:
  - `rounded-full`: Buttons, pills, and small interactive elements.
  - `rounded-3xl`: Cards, dialogs, and large structural containers.
  - **Focus**: `focus-visible:ring-2 focus-visible:ring-ring/40`.
  - **Borders**: Subtle `border-border/60`.
  - **Shadows**: `shadow-sm` base, elevation on hover if applicable.

## COMPONENT MAP

### Standard Primitives (Shadcn)

Standard components with MD3 overrides applied in-file:

- `accordion`, `alert`, `alert-dialog`, `badge`, `button`, `card`, `dialog`, `dropdown-menu`, `input`, `label`, `pagination`, `progress`, `resizable`, `scroll-area`, `separator`, `sonner`, `tabs`, `textarea`, `tooltip`.

### Custom Workspace Components

- `loading.tsx`: SVG-based spinner with configurable `size` (sm, md, lg) and `text`.
- `empty.tsx`: Layout pattern for empty states (Header, Media, Title, Description, Content).

## GUIDELINES

- **Modification**: Components are local. Feel free to edit, rename, or extend.
- **Naming**: File name = component name (kebab-case).
- **Icons**: Standardize on **Lucide React**.
