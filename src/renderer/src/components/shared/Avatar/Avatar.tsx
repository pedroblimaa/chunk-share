import './Avatar.css'

import { useState } from 'react'
import type { AvatarProps } from './Avatar.model'
import { getAvatarImageSource, getNextAvatarImageAttempt } from './avatar-image'

interface ImageLoadState {
  attempt: number
  imageUrl: string | null | undefined
}

function Avatar({
  className = '',
  imageUrl,
  initials,
  interactive = false,
  isActive = false,
  size = 'default',
  ...avatarProps
}: AvatarProps): React.JSX.Element {
  const [imageLoadState, setImageLoadState] = useState<ImageLoadState>({ attempt: 0, imageUrl })
  const attempt = imageLoadState.imageUrl === imageUrl ? imageLoadState.attempt : 0
  const imageSource = getAvatarImageSource(imageUrl, attempt)
  const classes = [
    'chunk-avatar',
    `chunk-avatar-${size}`,
    imageSource ? 'has-image' : '',
    interactive ? 'chunk-avatar-interactive' : '',
    isActive ? 'is-active' : '',
    className
  ]
    .filter(Boolean)
    .join(' ')

  function handleImageError(): void {
    setImageLoadState((currentState) => ({
      attempt: getNextAvatarImageAttempt(currentState.imageUrl === imageUrl ? currentState.attempt : 0),
      imageUrl
    }))
  }

  return (
    <span className={classes} {...avatarProps}>
      {imageSource ? (
        <img src={imageSource} alt="" aria-hidden="true" onError={handleImageError} />
      ) : (
        initials
      )}
    </span>
  )
}

export default Avatar
