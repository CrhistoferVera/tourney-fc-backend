import { Controller, Get, Param, Res } from '@nestjs/common';
import { Response } from 'express';
import { PrismaService } from '../prisma/prisma.service';

const APP_DEEPLINK = process.env.APP_DEEPLINK ?? 'tourneyfcapp://team/join';
const ANDROID_STORE_URL =
  process.env.ANDROID_STORE_URL ?? 'https://play.google.com/store';
const IOS_STORE_URL = process.env.IOS_STORE_URL ?? 'https://www.apple.com/app-store/';

// Escapa texto para incrustarlo de forma segura en HTML.
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Controlador PÚBLICO (sin JwtAuthGuard) que sirve la página puente de
 * invitación. El enlace compartido apunta aquí; la página intenta abrir la
 * app vía deep link y, si no está instalada, redirige a la tienda.
 */
@Controller('join')
export class InviteController {
  constructor(private readonly prisma: PrismaService) {}

  @Get(':code')
  async invitePage(@Param('code') code: string, @Res() res: Response) {
    const link = await this.prisma.enlaceInvitacion.findUnique({
      where: { codigo: code },
      include: {
        equipo: {
          include: { capitan: { select: { nombre: true } } },
        },
      },
    });

    const expirado =
      !link || (link.expiresAt != null && link.expiresAt.getTime() < Date.now());

    res
      .status(expirado ? 404 : 200)
      .type('html')
      .send(
        expirado ? this.renderInvalid() : this.renderInvite(code, link!),
      );
  }

  private renderInvalid(): string {
    return this.htmlShell(
      'Enlace no válido',
      `
        <div class="card">
          <div class="emoji">⚠️</div>
          <h1>Enlace no válido</h1>
          <p>Este enlace de invitación expiró o ya no existe. Pídele a tu capitán que genere uno nuevo.</p>
        </div>
      `,
    );
  }

  private renderInvite(
    code: string,
    link: { equipo: { nombre: string; escudo: string | null; capitan: { nombre: string } } },
  ): string {
    const nombre = escapeHtml(link.equipo.nombre);
    const capitan = escapeHtml(link.equipo.capitan.nombre);
    const escudo = link.equipo.escudo;
    const escudoHtml =
      escudo && /^https?:\/\//.test(escudo)
        ? `<img class="shield" src="${escapeHtml(escudo)}" alt="Escudo" />`
        : `<div class="shield placeholder">⚽</div>`;

    const deepLink = `${APP_DEEPLINK}?code=${encodeURIComponent(code)}`;

    return this.htmlShell(
      `Únete a ${nombre}`,
      `
        <div class="card">
          ${escudoHtml}
          <h1>${nombre}</h1>
          <p>Capitán: ${capitan}</p>
          <p class="muted">Te invitaron a unirte a este equipo en TourneyFC.</p>
          <a id="openApp" class="btn primary" href="${escapeHtml(deepLink)}">Abrir en la app</a>
          <a id="store" class="btn ghost" href="#">Descargar TourneyFC</a>
        </div>
        <script>
          (function () {
            var deepLink = ${JSON.stringify(deepLink)};
            var androidStore = ${JSON.stringify(ANDROID_STORE_URL)};
            var iosStore = ${JSON.stringify(IOS_STORE_URL)};
            var ua = navigator.userAgent || '';
            var isIOS = /iPad|iPhone|iPod/.test(ua);
            var storeUrl = isIOS ? iosStore : androidStore;

            document.getElementById('store').setAttribute('href', storeUrl);

            // Intenta abrir la app. Si sigue visible tras el timeout, asume
            // que no está instalada y manda a la tienda.
            var redirected = false;
            function goStore() {
              if (!redirected && !document.hidden) {
                redirected = true;
                window.location = storeUrl;
              }
            }
            window.location = deepLink;
            var timer = setTimeout(goStore, 1500);
            document.addEventListener('visibilitychange', function () {
              if (document.hidden) clearTimeout(timer);
            });

            document.getElementById('openApp').addEventListener('click', function (e) {
              e.preventDefault();
              redirected = false;
              window.location = deepLink;
              setTimeout(goStore, 1500);
            });
          })();
        </script>
      `,
    );
  }

  private htmlShell(title: string, body: string): string {
    return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #EBF0EC; color: #0F1A14; padding: 24px;
    }
    .card {
      background: #fff; border-radius: 20px; padding: 32px 24px; max-width: 360px; width: 100%;
      text-align: center; box-shadow: 0 8px 24px rgba(15,26,20,0.08);
    }
    .shield { width: 96px; height: 96px; border-radius: 16px; object-fit: cover; margin: 0 auto 16px; display: block; }
    .shield.placeholder { background: #EBF0EC; display: flex; align-items: center; justify-content: center; font-size: 44px; }
    .emoji { font-size: 44px; margin-bottom: 12px; }
    h1 { font-size: 22px; margin: 0 0 4px; color: #0D7A3E; }
    p { font-size: 15px; margin: 4px 0; color: #3D4F44; }
    p.muted { font-size: 13px; color: #6B7C70; margin-top: 12px; }
    .btn {
      display: block; width: 100%; padding: 14px; border-radius: 12px; margin-top: 16px;
      font-size: 15px; font-weight: 600; text-decoration: none;
    }
    .btn.primary { background: #0D7A3E; color: #fff; }
    .btn.ghost { background: #fff; color: #0D7A3E; border: 1px solid #CDE0D3; margin-top: 10px; }
  </style>
</head>
<body>
  ${body}
</body>
</html>`;
  }
}
