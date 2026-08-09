import './Card.css'

import type { FormHTMLAttributes, HTMLAttributes } from 'react'
import { getCardClassName } from './card-classes'
import { CARD_PRIVATE_PROP_NAMES, type CardProps } from './Card.model'

function Card(props: CardProps): React.JSX.Element {
  const classes = getCardClassName(props)
  const cardProps = getForwardedProps(props)

  if (props.as === 'form') {
    return (
      <form className={classes} {...(cardProps as FormHTMLAttributes<HTMLFormElement>)}>
        {props.children}
      </form>
    )
  }

  const as = props.as ?? 'section'
  const elementProps = cardProps as HTMLAttributes<HTMLElement>

  if (as === 'article') {
    return (
      <article className={classes} {...elementProps}>
        {props.children}
      </article>
    )
  }

  if (as === 'div') {
    return (
      <div className={classes} {...elementProps}>
        {props.children}
      </div>
    )
  }

  return (
    <section className={classes} {...elementProps}>
      {props.children}
    </section>
  )
}

function getForwardedProps(props: CardProps): Record<string, unknown> {
  return Object.fromEntries(Object.entries(props).filter(([key]) => !isCardPrivatePropName(key)))
}

function isCardPrivatePropName(key: string): boolean {
  return CARD_PRIVATE_PROP_NAMES.includes(key as (typeof CARD_PRIVATE_PROP_NAMES)[number])
}

export default Card
