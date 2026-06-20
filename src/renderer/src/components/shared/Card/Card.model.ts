import type { FormHTMLAttributes, HTMLAttributes, ReactNode } from 'react'

export type CardElement = 'article' | 'div' | 'form' | 'section'
export type CardPadding = 'default' | 'compact' | 'large'
export type CardTone = 'default' | 'panel' | 'active' | 'danger' | 'dashed'
export const CARD_PRIVATE_PROP_NAMES = [
  'as',
  'children',
  'className',
  'interactive',
  'padding',
  'tone'
] as const

interface BaseCardProps {
  children: ReactNode
  interactive?: boolean
  padding?: CardPadding
  tone?: CardTone
}

type NonFormCardElement = Exclude<CardElement, 'form'>

type NonFormCardProps = BaseCardProps &
  HTMLAttributes<HTMLElement> & {
    as?: NonFormCardElement
  }

type FormCardProps = BaseCardProps &
  FormHTMLAttributes<HTMLFormElement> & {
    as: 'form'
  }

export type CardProps = FormCardProps | NonFormCardProps
