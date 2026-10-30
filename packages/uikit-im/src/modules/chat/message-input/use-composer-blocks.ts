import { computed, onBeforeUnmount, ref } from 'vue'
import { MESSAGE_TYPE } from '@easemob-community/uikit-core'
import {
  collectSegmentsFromBlocks,
  createTextBlock,
  insertFilesAtCursor,
  normalizeComposerBlocks,
  revokeComposerBlock,
  type ComposerBlock,
  type ComposerFeatureFlags,
  type ComposerSegment,
  type ComposerTextBlock,
} from './composer-segment'

export function useComposerBlocks(options: {
  mediaDisabled: () => boolean
  features: () => ComposerFeatureFlags
  onOverflow: () => void
}) {
  const blocks = ref<ComposerBlock[]>([createTextBlock()])
  const activeTextId = ref(blocks.value[0].id)

  const hasMedia = computed(() => blocks.value.some(block => block.type !== MESSAGE_TYPE.TEXT))
  const hasContent = computed(() => collectSegmentsFromBlocks(blocks.value).length > 0)

  function focusText(id: string) {
    activeTextId.value = id
  }

  function activeTextBlock(): ComposerTextBlock | undefined {
    const block = blocks.value.find(item => item.id === activeTextId.value)
    return block?.type === MESSAGE_TYPE.TEXT ? block : undefined
  }

  function insertFiles(files: File[], cursor = 0, textIndex?: number) {
    if (options.mediaDisabled() || files.length === 0)
      return
    const index = textIndex
      ?? blocks.value.findIndex(block => block.id === activeTextId.value)
    const resolvedIndex = index >= 0 ? index : Math.max(0, blocks.value.length - 1)
    const result = insertFilesAtCursor(
      blocks.value,
      resolvedIndex,
      cursor,
      files,
      options.features(),
    )
    blocks.value = result.blocks
    activeTextId.value = result.focusId
    if (result.overflow)
      options.onOverflow()
  }

  function removeBlock(id: string) {
    const target = blocks.value.find(block => block.id === id)
    if (!target || target.type === MESSAGE_TYPE.TEXT)
      return
    revokeComposerBlock(target)
    blocks.value = normalizeComposerBlocks(blocks.value.filter(block => block.id !== id))
    const lastText = [...blocks.value].reverse().find(block => block.type === MESSAGE_TYPE.TEXT)
    if (lastText)
      activeTextId.value = lastText.id
  }

  function resetBlocks(content = '') {
    blocks.value.forEach(revokeComposerBlock)
    const next = createTextBlock(content)
    blocks.value = [next]
    activeTextId.value = next.id
  }

  function collect(): ComposerSegment[] {
    return collectSegmentsFromBlocks(blocks.value)
  }

  function getText(): string {
    return blocks.value
      .filter(block => block.type === MESSAGE_TYPE.TEXT)
      .map(block => block.content)
      .join('\n')
  }

  function setText(value: string) {
    resetBlocks(value)
  }

  onBeforeUnmount(() => {
    blocks.value.forEach(revokeComposerBlock)
  })

  return {
    blocks,
    activeTextId,
    hasMedia,
    hasContent,
    activeTextBlock,
    focusText,
    insertFiles,
    removeBlock,
    resetBlocks,
    collect,
    getText,
    setText,
  }
}
