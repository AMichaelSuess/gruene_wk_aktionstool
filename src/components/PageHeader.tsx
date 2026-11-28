import type { ReactNode } from "react";

interface PageHeaderProps {
  title: ReactNode;
  // Kurzer Hinweis unter dem Titel
  description?: ReactNode;
  // Knoepfe/Links rechts neben dem Titel, mobil darunter
  actions?: ReactNode;
}

/**
 * Titelzeile jeder Seite im internen Bereich. Bricht auf schmalen Bildschirmen
 * um, damit Titel und Knoepfe nie breiter als der Bildschirm werden.
 * src/__tests__/layout/manage-page-header.test.ts sorgt dafuer, dass alle Seiten sie nutzen.
 */
export default function PageHeader({ title, description, actions }: PageHeaderProps) {
  return (
    <div className="flex flex-col gap-3 mb-6 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <h1 className="font-headline text-2xl font-bold text-primary case-ui break-words">{title}</h1>
        {description && <div className="text-sm text-gray-600 mt-1">{description}</div>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
