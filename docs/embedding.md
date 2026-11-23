# Iframe-Einbettung

Einzelne Anmeldeformulare können direkt in die Website des Kreisverbands eingebettet werden.

**URL-Schema:** `https://<app-domain>/embed/actions/<aktionId>`

Die Aktions-ID steht im internen Bereich bei jeder Aktion.

## Einbettungs-Code

```html
<iframe
  id="grn-aktion"
  src="https://<app-domain>/embed/actions/<aktionId>"
  width="100%"
  height="600"
  style="border:0;"
></iframe>
<script>
  window.addEventListener('message', (e) => {
    if (e.origin !== 'https://<app-domain>') return;
    if (e.data?.type === 'grn-actions-resize') {
      document.getElementById('grn-aktion').style.height = e.data.height + 'px';
    }
  });
</script>
```

Das Script passt die Höhe des iframes an den Formularinhalt an, z. B. nach dem Absenden oder bei Fehlermeldungen.

## Konfiguration

Die erlaubte Domain wird beim Build gesetzt (im `Dockerfile` als `ARG` deklariert):

```env
ALLOWED_EMBED_DOMAIN=https://www.gruene-mitte.de
```

Ohne diese Variable darf die App nur sich selbst einbetten (`frame-ancestors 'self'`). Mit gesetzter Variable lautet der CSP-Header `frame-ancestors 'self' https://www.gruene-mitte.de`; alle anderen Domains blockiert der Browser.
