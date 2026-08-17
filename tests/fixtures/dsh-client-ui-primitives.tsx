/** Minimal icon facade for card rendering tests. */

import { createElement, type SVGProps } from 'react'

function icon(props: SVGProps<SVGSVGElement>) {
  return createElement('svg', { ...props, viewBox: '0 0 14 14', 'aria-hidden': true })
}

export function IconChevronDownOutline14(props: SVGProps<SVGSVGElement>) {
  return icon(props)
}

export function IconRefreshOutline14(props: SVGProps<SVGSVGElement>) {
  return icon(props)
}
