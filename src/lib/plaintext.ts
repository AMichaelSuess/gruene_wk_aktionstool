/**
 * Erzeugt aus dem HTML unserer Mail-Templates eine lesbare Textversion.
 * Mails mit Textteil landen seltener im Spam und sind in Programmen lesbar,
 * die nur Text anzeigen. Bewusst einfach gehalten – es muss nur das HTML aus
 * src/lib/email-templates.ts verstehen, kein beliebiges HTML.
 */
export function htmlToText(html: string): string {
  let text = html
    // Kopfbereich (Styles, Meta) und Bilder haben keinen Textinhalt
    .replace(/<head[\s\S]*?<\/head>/gi, "")
    .replace(/<img[^>]*>/gi, "")
    // Zeilenumbrüche im Quelltext sind in HTML nur Leerzeichen
    .replace(/\s+/g, " ")
    // Links: Beschriftung plus Adresse, denn im Text kann man nicht klicken
    .replace(/<a\s[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, (_, href: string, label: string) => {
      const cleanLabel = stripTags(label).replace(/\s*→\s*$/, "").trim();
      // Leerzeichen drumherum, damit nichts mit Folgetext verklebt.
      // mailto:/tel:-Links zeigen Adresse bzw. Nummer schon als Beschriftung.
      if (/^(mailto|tel):/i.test(href)) return ` ${cleanLabel || href.replace(/^[a-z]+:/i, "")} `;
      return cleanLabel === href || cleanLabel === "" ? ` ${href} ` : ` ${cleanLabel}: ${href} `;
    })
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<hr[^>]*>/gi, "\n\n----------\n\n")
    .replace(/<li[^>]*>/gi, "\n- ")
    .replace(/<\/(p|div|h[1-6]|ul|tr)>/gi, "\n\n")
    .replace(/<(h[1-6])[^>]*>/gi, "\n\n");

  text = decodeEntities(stripTags(text));

  return text
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function stripTags(html: string): string {
  return html.replace(/<[^>]*>/g, "");
}

function decodeEntities(text: string): string {
  return text
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    // zuletzt, damit z. B. "&amp;lt;" zu "&lt;" wird und nicht zu "<"
    .replace(/&amp;/g, "&");
}
