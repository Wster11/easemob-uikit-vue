import type { MultiBodySegmentInput } from '@easemob-community/uikit-core'
import { MESSAGE_TYPE } from '@easemob-community/uikit-core'

/** 输入框按文档顺序交出的分段。发送时 1 段走单条消息，2–20 段走 multi_body。 */
export type ComposerSegment =
  | { type: 'text', content: string }
  | { type: 'image', file?: File, url: string }
  | { type: 'file', file: File }
  | { type: 'video', file: File, duration?: number }

export interface ComposerTextBlock {
  id: string
  type: 'text'
  content: string
}

export interface ComposerImageBlock {
  id: string
  type: 'image'
  file: File
  url: string
}

export interface ComposerFileBlock {
  id: string
  type: 'file'
  file: File
}

export interface ComposerVideoBlock {
  id: string
  type: 'video'
  file: File
  url: string
}

export type ComposerMediaBlock = ComposerImageBlock | ComposerFileBlock | ComposerVideoBlock
export type ComposerBlock = ComposerTextBlock | ComposerMediaBlock

export interface ComposerFeatureFlags {
  image: boolean
  file: boolean
  video: boolean
}

export const COMPOSER_SEGMENT_LIMIT = 20

/** 输入框内图片展示上限，与消息气泡 image-message 的 240 对齐。 */
export const COMPOSER_IMAGE_MAX_WIDTH = 240
export const COMPOSER_IMAGE_MAX_HEIGHT = 240

/** 按原图像素等比缩小进上限框，不放大、不裁切。 */
export function scaleComposerImageSize(width: number, height: number): { width: number, height: number } {
  if (!width || !height || width <= 0 || height <= 0)
    return { width: 160, height: 120 }
  const ratio = Math.min(COMPOSER_IMAGE_MAX_WIDTH / width, COMPOSER_IMAGE_MAX_HEIGHT / height, 1)
  return {
    width: Math.round(width * ratio),
    height: Math.round(height * ratio),
  }
}

export function classifyComposerFile(file: File): 'image' | 'video' | 'file' {
  if (file.type.startsWith('image/'))
    return 'image'
  if (file.type.startsWith('video/'))
    return 'video'
  return 'file'
}

export function filterComposerFiles(
  files: File[],
  allowed: ComposerFeatureFlags,
  pasteImagePreview = true,
): File[] {
  return files.filter((file) => {
    const kind = classifyComposerFile(file)
    if (kind === 'image' && !pasteImagePreview)
      return false
    return allowed[kind]
  })
}

export function formatComposerFileSize(bytes: number): string {
  if (bytes < 1024)
    return `${bytes} B`
  if (bytes < 1024 * 1024)
    return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

/** 剪贴板 / 拖放里的本地文件。截图通常只出现在 items 里。 */
export function filesFromDataTransfer(data: DataTransfer | null | undefined): File[] {
  if (!data)
    return []
  const seen = new Set<File>()
  const files: File[] = []
  const add = (file: File | null) => {
    if (!file || seen.has(file))
      return
    seen.add(file)
    files.push(file)
  }
  for (const file of Array.from(data.files || []))
    add(file)
  for (const item of Array.from(data.items || [])) {
    if (item.kind === 'file')
      add(item.getAsFile())
  }
  return files
}

/** 读取本地视频时长（秒），失败时回落 1，满足 SDK duration 必须为正。 */
export function readVideoDuration(file: File): Promise<number> {
  return new Promise((resolve) => {
    if (typeof document === 'undefined') {
      resolve(1)
      return
    }
    const video = document.createElement('video')
    const url = URL.createObjectURL(file)
    video.preload = 'metadata'
    video.muted = true
    video.playsInline = true
    video.src = url
    let settled = false
    const finish = (duration: number) => {
      if (settled)
        return
      settled = true
      URL.revokeObjectURL(url)
      resolve(Math.max(1, Math.floor(duration || 0)))
    }
    video.addEventListener('loadedmetadata', () => finish(video.duration))
    video.addEventListener('error', () => finish(1))
    setTimeout(() => finish(1), 5000)
  })
}

function createComposerId(): string {
  return `c-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

export function createTextBlock(content = ''): ComposerTextBlock {
  return { id: createComposerId(), type: MESSAGE_TYPE.TEXT, content }
}

export function createMediaBlock(file: File): ComposerMediaBlock {
  const kind = classifyComposerFile(file)
  const id = createComposerId()
  if (kind === MESSAGE_TYPE.IMAGE)
    return { id, type: MESSAGE_TYPE.IMAGE, file, url: URL.createObjectURL(file) }
  if (kind === MESSAGE_TYPE.VIDEO)
    return { id, type: MESSAGE_TYPE.VIDEO, file, url: URL.createObjectURL(file) }
  return { id, type: MESSAGE_TYPE.FILE, file }
}

export function isComposerMediaBlock(block: ComposerBlock): block is ComposerMediaBlock {
  return block.type !== MESSAGE_TYPE.TEXT
}

export function revokeComposerBlock(block: ComposerBlock) {
  if (block.type === MESSAGE_TYPE.IMAGE || block.type === MESSAGE_TYPE.VIDEO)
    URL.revokeObjectURL(block.url)
}

export function normalizeComposerBlocks(blocks: ComposerBlock[]): ComposerBlock[] {
  const out: ComposerBlock[] = []
  for (const block of blocks) {
    if (block.type === MESSAGE_TYPE.TEXT && !block.content && out.length > 0 && out[out.length - 1].type === MESSAGE_TYPE.TEXT)
      continue
    out.push(block)
  }
  if (out.length === 0)
    return [createTextBlock()]
  if (out[0].type !== MESSAGE_TYPE.TEXT)
    out.unshift(createTextBlock())
  if (out[out.length - 1].type !== MESSAGE_TYPE.TEXT)
    out.push(createTextBlock())
  return out
}

export function collectSegmentsFromBlocks(blocks: readonly ComposerBlock[]): ComposerSegment[] {
  const segments: ComposerSegment[] = []
  for (const block of blocks) {
    if (block.type === MESSAGE_TYPE.TEXT) {
      const content = block.content.replace(/\u00a0/g, ' ').replace(/^\s+|\s+$/g, '')
      if (content)
        segments.push({ type: MESSAGE_TYPE.TEXT, content })
      continue
    }
    if (block.type === MESSAGE_TYPE.IMAGE)
      segments.push({ type: MESSAGE_TYPE.IMAGE, file: block.file, url: block.url })
    else if (block.type === MESSAGE_TYPE.VIDEO)
      segments.push({ type: MESSAGE_TYPE.VIDEO, file: block.file })
    else
      segments.push({ type: MESSAGE_TYPE.FILE, file: block.file })
  }
  return segments
}

export function insertFilesAtCursor(
  blocks: ComposerBlock[],
  textIndex: number,
  cursor: number,
  files: File[],
  allowed: ComposerFeatureFlags,
): { blocks: ComposerBlock[], focusId: string, overflow: boolean } {
  const current = blocks.slice()
  const target = current[textIndex]
  const beforeContent = target?.type === MESSAGE_TYPE.TEXT ? target.content.slice(0, cursor) : ''
  const afterContent = target?.type === MESSAGE_TYPE.TEXT ? target.content.slice(cursor) : ''

  const media: ComposerMediaBlock[] = []
  let overflow = false
  let remaining = COMPOSER_SEGMENT_LIMIT - collectSegmentsFromBlocks(current).length
  for (const file of files) {
    const kind = classifyComposerFile(file)
    if (!allowed[kind])
      continue
    if (remaining <= 0) {
      overflow = true
      break
    }
    media.push(createMediaBlock(file))
    remaining -= 1
  }
  if (media.length === 0) {
    const fallback = target?.id ?? current[current.length - 1]?.id ?? createTextBlock().id
    return { blocks: current, focusId: fallback, overflow }
  }

  const head = current.slice(0, Math.max(0, textIndex))
  const tail = current.slice(textIndex + 1)
  const beforeBlock = target?.type === MESSAGE_TYPE.TEXT
    ? { ...target, content: beforeContent }
    : createTextBlock(beforeContent)
  const afterBlock = createTextBlock(afterContent)
  const normalized = normalizeComposerBlocks([...head, beforeBlock, ...media, afterBlock, ...tail])
  const lastText = [...normalized].reverse().find(block => block.type === MESSAGE_TYPE.TEXT)
  return { blocks: normalized, focusId: lastText?.id ?? afterBlock.id, overflow }
}

export async function composerSegmentToInput(segment: ComposerSegment): Promise<MultiBodySegmentInput | undefined> {
  if (segment.type === MESSAGE_TYPE.TEXT) {
    const content = segment.content.replace(/\u00a0/g, ' ').trim()
    if (!content)
      return undefined
    return { type: MESSAGE_TYPE.TEXT, content }
  }
  if (segment.type === MESSAGE_TYPE.IMAGE) {
    if (segment.file) {
      return {
        type: MESSAGE_TYPE.IMAGE,
        data: segment.file,
        filename: segment.file.name,
        filetype: segment.file.type || undefined,
      }
    }
    if (segment.url && !segment.url.startsWith('blob:'))
      return { type: MESSAGE_TYPE.IMAGE, originalUrl: segment.url }
    return undefined
  }
  if (segment.type === MESSAGE_TYPE.VIDEO) {
    return {
      type: MESSAGE_TYPE.VIDEO,
      data: segment.file,
      filename: segment.file.name,
      filetype: segment.file.type || undefined,
      duration: segment.duration ?? await readVideoDuration(segment.file),
    }
  }
  return {
    type: MESSAGE_TYPE.FILE,
    data: segment.file,
    filename: segment.file.name,
    filetype: segment.file.type || undefined,
    fileSize: segment.file.size,
  }
}
