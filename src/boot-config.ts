/**
 * Host-rendered configuration bootstrap for the browser half: each index
 * response embeds the schema-validated plugin config as a window global the
 * client entry reads at apply time. Same pattern as ui-theme's boot theme.
 */

import { BELL_BOOT_GLOBAL, type BellConfig } from './config.ts'

/** Build the inline script assigning the validated config to the boot global. */
function bootConfigScript(config: BellConfig): string {
  return `<script>window[${JSON.stringify(BELL_BOOT_GLOBAL)}]=${JSON.stringify(config)}</script>`
}

/**
 * Insert the config bootstrap immediately after the opening body tag, before
 * any plugin bundle runs. Body-less fragments receive it at the end, where
 * the HTML parser has already synthesized a body.
 * @param html - Raw application index HTML.
 * @param config - Schema-validated configuration.
 * @returns HTML containing the config bootstrap.
 */
export function injectBootConfig(html: string, config: BellConfig): string {
  const script = bootConfigScript(config)
  const body = /<body(?:\s[^>]*)?>/i.exec(html)
  if (body === null) return `${html}${script}`
  const at = body.index + body[0].length
  return `${html.slice(0, at)}${script}${html.slice(at)}`
}
