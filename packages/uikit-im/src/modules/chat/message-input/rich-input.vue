<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import { EditorContent, useEditor } from '@tiptap/vue-3'
import StarterKit from '@tiptap/starter-kit'
import { useLocale, useToast } from '@easemob-community/uikit-core'
import { useResizable, useViewport } from '@easemob-community/uikit-core'
import { filterActiveMentions } from '../../../utils/mention'
import { EmButton as Button } from '@easemob-community/uikit-core'
import { EmIcon as Icon } from '@easemob-community/uikit-core'
import type { ChatConfig, MentionContact } from '../types'
import { ComposerAttachment } from './composer-attachment'
import { ComposerImageNode } from './composer-image-node'
import { ComposerTrailingParagraph } from './composer-trailing-node'
import {
  classifyComposerFile,
  COMPOSER_SEGMENT_LIMIT,
  filesFromDataTransfer,
  filterComposerFiles,
  type ComposerSegment,
} from './composer-segment'

/** @deprecated 使用 ComposerSegment。保留别名避免上层 import 断裂。 */
export type RichComposerSegment = ComposerSegment

export interface RichInputProps {
  config?: ChatConfig['input']
  /** 是否启用 @提及 */
  enableMention?: boolean
  /** @提及选择弹层是否打开（打开时 Enter 优先用于选择联系人，不发送消息） */
  mentionOpen?: boolean
  /** 编辑文字时禁止插入媒体 */
  mediaDisabled?: boolean
}

const props = defineProps<RichInputProps>()

const { show: showToast } = useToast()

const emit = defineEmits<{
  (e: 'send', html: string, text: string, mentionList?: MentionContact[], segments?: ComposerSegment[]): void
  (e: 'embed-change', hasEmbed: boolean): void
  (e: 'emoji-click', anchor: HTMLElement): void
  (e: 'voice-start'): void
  (e: 'voice-end'): void
  (e: 'mention-trigger', anchor: HTMLElement, keyword: string): void
  (e: 'mention-close'): void
  (e: 'focus'): void
  (e: 'typing'): void
  /** 展开/收起输入区（供上层关闭 emoji/mention 等锚点弹层） */
  (e: 'expand-change', expanded: boolean): void
  /** 点击工具栏翻译按钮（业务链路交由宿主接入） */
  (e: 'translation-click'): void
  /** 点击工具栏名片按钮（业务链路交由宿主接入） */
  (e: 'contact-card-click'): void
}>()

const { t } = useLocale()
const { isMobile } = useViewport()

/** 输入框风格 */
const style = computed(() => props.config?.style ?? 'toolbar-top')

/** 编辑器内容区高度（拖拽后固定，null 表示未拖拽：内容自适应 + max-height 150px） */
const editorHeight = ref<number | null>(null)

/** 拖拽手柄 ref */
const resizeHandleRef = ref<HTMLElement>()

/** 组件根元素 ref（展开态测量聊天容器高度用） */
const rootRef = ref<HTMLElement>()

/** 是否处于展开态（原地撑高输入区，仅 PC） */
const expanded = ref(false)

/** 展开前的编辑器高度（含用户拖拽值），收起时恢复 */
let preExpandHeight: number | null = null

/** 是否显示展开/收起按钮（PC 且未通过 config 关闭） */
const showExpandBtn = computed(() => !isMobile.value && props.config?.expandable !== false)

/** 是否显示拖拽手柄（PC 且未通过 config 关闭；展开态下隐藏，避免拖拽 clamp 与展开高度冲突） */
const showResizeHandle = computed(() => !isMobile.value && props.config?.resizable !== false && !expanded.value)

useResizable(resizeHandleRef, {
  axis: 'vertical',
  min: 60,
  max: 240,
  // 手柄在编辑器上缘：向上拖动增高（反向增量）
  invert: true,
  disabled: () => !showResizeHandle.value,
  onChange: (h) => {
    editorHeight.value = h
  },
})

/** 编辑器里是否已有图片/附件块。有媒体时抬高输入区，避免缩略图被 150px 裁掉。 */
const hasEmbed = ref(false)

/** CSS 变量（用于全局样式中的 caret/selection/编辑器高度） */
const cssVars = computed(() => ({
  '--rich-input-caret-color': props.config?.caretColor || 'auto',
  '--rich-input-selection-color': props.config?.selectionColor || 'var(--uikit-selection-bg)',
  // 拖拽后的编辑器固定高度：height 与 max-height 同值（内容少时撑满、内容多时滚动）；未拖拽时不输出，由 CSS fallback 兜底
  ...(editorHeight.value !== null
    ? {
      '--rich-input-editor-height': `${editorHeight.value}px`,
      '--rich-input-editor-max-height': `${editorHeight.value}px`,
    }
    : hasEmbed.value
      ? { '--rich-input-editor-max-height': '360px' }
      : {}),
}))

/** 最大输入长度 */
const maxLength = computed(() => props.config?.maxLength ?? 0)

/** 功能开关（translation/contactCard 默认关闭：仅渲染按钮，业务链路交由宿主接入） */
const features = computed(() => ({
  emoji: props.config?.features?.emoji !== false,
  image: props.config?.features?.image !== false,
  file: props.config?.features?.file !== false,
  voice: props.config?.features?.voice !== false,
  video: props.config?.features?.video !== false,
  translation: props.config?.features?.translation === true,
  contactCard: props.config?.features?.contactCard === true,
}))

/** 是否显示发送按钮：显式配置优先；未配置时 PC 隐藏（回车发送）、移动端显示 */
const showSendButton = computed(() => props.config?.showSendButton ?? !isMobile.value)

/** 是否正在录音 */
const isRecording = ref(false)

/** @提及锚点位置 */
const mentionAnchorPos = ref(-1)

/** 已插入的 @提及列表 */
const mentionList = ref<MentionContact[]>([])

/** 输入状态提示节流 */
let typingThrottleTimer: ReturnType<typeof setTimeout> | null = null
let isTypingThrottled = false

/** 触发输入状态 */
function triggerTyping() {
  if (isTypingThrottled) {
    return
  }
  isTypingThrottled = true
  emit('typing')
  typingThrottleTimer = setTimeout(() => {
    isTypingThrottled = false
    typingThrottleTimer = null
  }, 5000)
}

/** Tiptap 编辑器实例 */
const editor = useEditor({
  extensions: [
    StarterKit.configure({
      heading: false,
      blockquote: false,
      horizontalRule: false,
      codeBlock: false,
    }),
    ComposerImageNode,
    ComposerAttachment,
    ComposerTrailingParagraph,
  ],
  content: '',
  onCreate: ({ editor: e }) => {
    updateHasContent(e)
    if (props.config?.autoFocus) {
      e.commands.focus()
    }
  },
  onUpdate: ({ editor: e }) => {
    updateHasContent(e)
    triggerTyping()
  },
  onFocus: () => emit('focus'),
  editorProps: {
    attributes: {
      class: 'rich-input__editor-content',
    },
    handlePaste: (_view, event) => {
      const files = filterComposerFiles(
        filesFromDataTransfer(event.clipboardData),
        features.value,
        props.config?.pasteImagePreview !== false,
      )
      if (files.length > 0) {
        event.preventDefault()
        insertComposerFiles(files)
        return true
      }
      if (maxLength.value > 0) {
        const text = _view.state.doc.textContent
        const pastedText = event.clipboardData?.getData('text/plain') || ''
        if (text.length + pastedText.length > maxLength.value) {
          event.preventDefault()
          return true
        }
      }
      return false
    },
    handleDrop: (_view, event) => {
      const files = filterComposerFiles(filesFromDataTransfer(event.dataTransfer), features.value)
      if (files.length === 0)
        return false
      event.preventDefault()
      insertComposerFiles(files)
      return true
    },
    handleKeyDown: (_view, event) => {
      const selected = (_view.state.selection as { node?: { type: { name: string } } }).node
      const mediaSelected = selected?.type.name === 'image' || selected?.type.name === 'composerAttachment'

      // 选中图片/附件时直接打字：落到节点后面的段落，而不是替换媒体块
      if (mediaSelected && event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
        if (maxLength.value > 0 && _view.state.doc.textContent.length >= maxLength.value)
          return true
        event.preventDefault()
        typeAfterMedia(_view.state.selection.to, event.key)
        return true
      }

      // 最大长度限制：阻止普通字符输入
      if (maxLength.value > 0 && event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
        const text = _view.state.doc.textContent
        if (text.length >= maxLength.value) {
          event.preventDefault()
          return true
        }
      }
      if (event.key === '@' && props.enableMention) {
        mentionAnchorPos.value = _view.state.selection.from
        requestAnimationFrame(() => {
          if (!editor.value)
            return
          const pos = editor.value.state.selection.from
          const coords = editor.value.view.coordsAtPos(pos)
          const anchor = document.createElement('div')
          anchor.style.position = 'fixed'
          anchor.style.left = `${coords.left}px`
          anchor.style.top = `${coords.top + 20}px`
          anchor.style.width = '1px'
          anchor.style.height = '1px'
          anchor.style.pointerEvents = 'none'
          document.body.appendChild(anchor)

          const text = editor.value.getText()
          const offset = editor.value.state.selection.from
          const beforeText = text.substring(0, offset)
          const lastAt = beforeText.lastIndexOf('@')
          const keyword = lastAt >= 0 ? beforeText.substring(lastAt + 1) : ''

          emit('mention-trigger', anchor, keyword)
        })
      }
      // 展开态下 Esc 收起输入区（mention 弹层打开时让弹层先处理 Esc）
      if (event.key === 'Escape' && expanded.value && !props.mentionOpen) {
        event.preventDefault()
        toggleExpand()
        return true
      }
      if (event.key === 'Enter' && !event.shiftKey) {
        // @提及弹层打开时，Enter 优先交给弹层选择联系人，不发送消息
        if (props.mentionOpen) {
          event.preventDefault()
          return true
        }
        event.preventDefault()
        handleSend()
        return true
      }
      return false
    },
  },
})

/** 展开态目标高度：聊天容器高度的 50%，clamp 在 240~600px */
function getExpandedHeight(): number {
  const container = rootRef.value?.closest('.chat') as HTMLElement | null
  const base = container?.clientHeight ?? (typeof window !== 'undefined' ? window.innerHeight : 600)
  return Math.min(Math.max(Math.round(base * 0.5), 240), 600)
}

/** 切换展开/收起：只改高度，不重建编辑器，内容与光标保留 */
function toggleExpand() {
  if (expanded.value) {
    editorHeight.value = preExpandHeight
    expanded.value = false
  }
  else {
    preExpandHeight = editorHeight.value
    editorHeight.value = getExpandedHeight()
    expanded.value = true
  }
  emit('expand-change', expanded.value)
  editor.value?.commands.focus()
}

/** 是否有内容（文本、图片或附件块） */
const hasContent = ref(false)

function updateHasContent(e: any) {
  const text = e.getText().trim()
  let embed = false
  e.state.doc.descendants((node: { type: { name: string } }) => {
    if (node.type.name === 'image' || node.type.name === 'composerAttachment')
      embed = true
  })
  hasContent.value = text.length > 0 || embed
  hasEmbed.value = embed
  emit('embed-change', embed)
}

/** 待回收的媒体 Blob URL */
const inlineMediaBlobUrls = new Set<string>()

/** blob URL → 原始文件。发送时必须交出 File，不能把 blob: 地址当成远程 URL */
const inlineMediaFiles = new Map<string, File>()

function countComposerSegments(): number {
  return collectRichSegments().length
}

function rememberMediaFile(file: File): string {
  const url = URL.createObjectURL(file)
  inlineMediaBlobUrls.add(url)
  inlineMediaFiles.set(url, file)
  return url
}

function insertComposerFiles(files: File[]) {
  if (props.mediaDisabled || !editor.value || files.length === 0)
    return
  let remaining = COMPOSER_SEGMENT_LIMIT - countComposerSegments()
  if (remaining <= 0) {
    showToast(t('chat.input.multiBodyLimit'), 'error')
    return
  }
  const chain = editor.value.chain().focus()
  let overflow = false
  for (const file of files) {
    const kind = classifyComposerFile(file)
    if (kind === 'image' && features.value.image === false)
      continue
    if (kind === 'video' && features.value.video === false)
      continue
    if (kind === 'file' && features.value.file === false)
      continue
    if (remaining <= 0) {
      overflow = true
      break
    }
    const url = rememberMediaFile(file)
    if (kind === 'image') {
      chain.insertContent({ type: 'image', attrs: { src: url } })
    }
    else {
      chain.insertContent({
        type: 'composerAttachment',
        attrs: {
          src: url,
          kind,
          filename: file.name,
          filesize: file.size,
        },
      })
    }
    remaining -= 1
  }
  chain.run()
  editor.value.commands.focus('end')
  if (overflow)
    showToast(t('chat.input.multiBodyLimit'), 'error')
}

/** 媒体块被选中时，把字符写进它后面的段落。 */
function typeAfterMedia(afterPos: number, text: string) {
  const current = editor.value
  if (!current)
    return
  const $pos = current.state.doc.resolve(afterPos)
  const after = $pos.nodeAfter
  if (after?.type.name === 'paragraph') {
    current.chain().setTextSelection(afterPos + 1).insertContent(text).focus().run()
    return
  }
  current.chain().insertContentAt(afterPos, {
    type: 'paragraph',
    content: [{ type: 'text', text }],
  }).focus().run()
}

function pushMediaSegment(src: string, kind: 'image' | 'file' | 'video') {
  const file = inlineMediaFiles.get(src)
  if (kind === 'image')
    return { type: 'image' as const, file, url: src }
  if (kind === 'video' && file)
    return { type: 'video' as const, file }
  if (file)
    return { type: 'file' as const, file }
  return undefined
}

/** 按文档顺序收集文本、图片、文件、视频。媒体节点会先冲掉前面的文本缓冲。 */
function collectRichSegments(): ComposerSegment[] {
  const current = editor.value
  if (!current)
    return []
  const segments: ComposerSegment[] = []
  let buffer = ''
  const flush = () => {
    const content = buffer.replace(/\u00a0/g, ' ').replace(/^\s+|\s+$/g, '')
    if (content)
      segments.push({ type: 'text', content })
    buffer = ''
  }
  const takeMedia = (kind: 'image' | 'file' | 'video', src: string) => {
    flush()
    const segment = pushMediaSegment(src, kind)
    if (segment)
      segments.push(segment)
  }
  current.state.doc.forEach((block) => {
    if (block.type.name === 'image') {
      takeMedia('image', String(block.attrs.src || ''))
      return
    }
    if (block.type.name === 'composerAttachment') {
      takeMedia(block.attrs.kind === 'video' ? 'video' : 'file', String(block.attrs.src || ''))
      return
    }
    if (buffer)
      buffer += '\n'
    block.descendants((node) => {
      if (node.isText) {
        buffer += node.text || ''
        return false
      }
      if (node.type.name === 'hardBreak') {
        buffer += '\n'
        return false
      }
      if (node.type.name === 'image') {
        takeMedia('image', String(node.attrs.src || ''))
        return false
      }
      if (node.type.name === 'composerAttachment') {
        takeMedia(node.attrs.kind === 'video' ? 'video' : 'file', String(node.attrs.src || ''))
        return false
      }
      return true
    })
  })
  flush()
  return segments
}

function releaseInlineMedia() {
  inlineMediaBlobUrls.forEach(url => URL.revokeObjectURL(url))
  inlineMediaBlobUrls.clear()
  inlineMediaFiles.clear()
}

/** 发送消息 */
function handleSend() {
  if (!editor.value)
    return
  const segments = collectRichSegments()
  if (segments.length === 0 && !hasContent.value)
    return
  const html = editor.value.getHTML()
  const text = editor.value.getText()
  const activeMentions = filterActiveMentions(text, mentionList.value)
  emit('send', html, text, activeMentions.length > 0 ? activeMentions : undefined, segments)
  editor.value.commands.clearContent()
  releaseInlineMedia()
  mentionList.value = []
  hasContent.value = false
  hasEmbed.value = false
  emit('embed-change', false)
}

/** 表情按钮 ref */
const emojiBtnRef = ref<HTMLElement>()

/** 是否展开自定义面板（由 #input-panel 插槽使用） */
const showPanel = ref(false)

/** 切换自定义面板 */
function togglePanel() {
  showPanel.value = !showPanel.value
}

/** 关闭自定义面板 */
function closePanel() {
  showPanel.value = false
}

/** 触发文件选择 */
const imageInputRef = ref<HTMLInputElement>()
const fileInputRef = ref<HTMLInputElement>()
const videoInputRef = ref<HTMLInputElement>()

function triggerFileInput(type: 'image' | 'file' | 'video') {
  if (props.mediaDisabled)
    return
  const ref = type === 'image' ? imageInputRef : type === 'video' ? videoInputRef : fileInputRef
  ref.value?.click()
}

function onFileSelected(_type: 'image' | 'file' | 'video', event: Event) {
  const files = (event.target as HTMLInputElement).files
  if (!files || files.length === 0)
    return
  insertComposerFiles(Array.from(files))
  ;(event.target as HTMLInputElement).value = ''
}

/** 语音录制 */
function toggleVoice() {
  if (isRecording.value) {
    isRecording.value = false
    emit('voice-end')
  }
  else {
    isRecording.value = true
    emit('voice-start')
  }
}

/** 点击表情按钮 */
function onEmojiClick() {
  if (emojiBtnRef.value) {
    emit('emoji-click', emojiBtnRef.value)
  }
}

/** 插入 Emoji */
function insertEmoji(emoji: string) {
  editor.value?.chain().focus().insertContent(emoji).run()
}

/** 插入 @提及（替换当前 @keyword） */
function insertMention(name: string, contact?: MentionContact) {
  if (!editor.value || mentionAnchorPos.value < 0)
    return
  const currentPos = editor.value.state.selection.from
  editor.value
    .chain()
    .focus()
    .deleteRange({ from: mentionAnchorPos.value, to: currentPos })
    .insertContent(`@${name} `)
    .run()
  mentionAnchorPos.value = -1
  if (contact && !mentionList.value.find(m => m.userId === contact.userId)) {
    mentionList.value.push(contact)
  }
}

/** 在末尾追加 @提及 */
function appendMention(name: string, contact?: MentionContact) {
  if (!editor.value)
    return
  editor.value
    .chain()
    .focus()
    .insertContent(`@${name} `)
    .run()
  if (contact && !mentionList.value.find(m => m.userId === contact.userId)) {
    mentionList.value.push(contact)
  }
}

/** 设置编辑器内容（用于重新编辑等场景） */
function setText(value: string) {
  editor.value?.commands.setContent(value)
  mentionList.value = []
}

/** 获取当前编辑器纯文本内容 */
function getText(): string {
  return editor.value?.getText() || ''
}

/** 暴露方法 */
defineExpose({
  insertMention,
  appendMention,
  insertEmoji,
  setText,
  getText,
})

/** 组件卸载时销毁编辑器并回收 Blob URL */
onBeforeUnmount(() => {
  editor.value?.destroy()
  releaseInlineMedia()
  if (typingThrottleTimer) {
    clearTimeout(typingThrottleTimer)
    typingThrottleTimer = null
  }
})
</script>

<template>
  <div
    ref="rootRef"
    class="rich-input"
    :class="{
      'rich-input--toolbar-bottom': style === 'toolbar-bottom',
      'rich-input--toolbar-top': style === 'toolbar-top',
      'rich-input--expanded': expanded,
    }"
    :style="cssVars"
  >
    <!-- 工具栏 -->
    <div class="rich-input__toolbar">
      <div v-if="features.emoji" ref="emojiBtnRef" class="rich-input__tool-btn" @click="onEmojiClick">
        <Icon name="circle/face" :size="20" />
      </div>
      <div v-if="features.image && !mediaDisabled" class="rich-input__tool-btn" @click="triggerFileInput('image')">
        <Icon name="rect/img" :size="20" />
      </div>
      <div v-if="features.video && !mediaDisabled" class="rich-input__tool-btn" @click="triggerFileInput('video')">
        <Icon name="rect/triangle" :size="20" />
      </div>
      <div v-if="features.file && !mediaDisabled" class="rich-input__tool-btn" @click="triggerFileInput('file')">
        <Icon name="file/empty" :size="20" />
      </div>
      <div v-if="features.translation" class="rich-input__tool-btn" :title="t('chat.input.translate', '翻译')" @click="emit('translation-click')">
        <Icon name="dict" :size="20" />
      </div>
      <div v-if="features.contactCard" class="rich-input__tool-btn" :title="t('chat.input.contactCard', '发送名片')" @click="emit('contact-card-click')">
        <Icon name="person/card" :size="20" />
      </div>
      <div v-if="features.voice" class="rich-input__tool-btn" @click="toggleVoice">
        <Icon :name="isRecording ? 'mic' : 'mic'" :size="20" />
      </div>
      <slot name="toolbar-extra" :toggle-panel="togglePanel" :show-panel="showPanel" :close-panel="closePanel" />
      <!-- 展开/收起输入区（仅 PC，工具栏右端） -->
      <div
        v-if="showExpandBtn"
        class="rich-input__tool-btn rich-input__expand-btn"
        :title="expanded ? t('chat.input.collapse', '收起输入框') : t('chat.input.expand', '展开输入框')"
        @click="toggleExpand"
      >
        <Icon :name="expanded ? 'chevron/up' : 'chevron/down'" :size="20" />
      </div>
    </div>

    <!-- 输入区域 -->
    <div class="rich-input__field-area">
      <template v-if="!isRecording">
        <div class="rich-input__editor-wrapper">
          <EditorContent :editor="editor" />
          <div v-if="!hasContent" class="rich-input__placeholder">
            {{ t('chat.placeholder') }}
          </div>
          <!-- 拖拽手柄：编辑器上缘拖动调整高度（仅 PC） -->
          <div
            v-if="showResizeHandle"
            ref="resizeHandleRef"
            class="rich-input__resize-handle"
          />
        </div>
      </template>
      <div v-else class="rich-input__voice-btn">
        {{ isRecording ? t('chat.voice.releaseEnd') : t('chat.voice.holdTalk') }}
      </div>
    </div>

    <!-- 自定义面板：由 #input-panel 插槽填充 -->
    <div v-if="showPanel" class="rich-input__panel">
      <slot name="input-panel" :show-panel="showPanel" :close-panel="closePanel" />
    </div>

    <!-- 发送按钮 -->
    <div v-if="showSendButton" class="rich-input__actions">
      <Button
        type="primary"
        size="small"
        :disabled="!hasContent"
        @click="handleSend"
      >
        {{ t('chat.send') }}
      </Button>
    </div>

    <!-- 隐藏的文件输入 -->
    <input
      ref="imageInputRef"
      type="file"
      accept="image/*"
      multiple
      style="display: none"
      @change="onFileSelected('image', $event)"
    >
    <input
      ref="videoInputRef"
      type="file"
      accept="video/*"
      multiple
      style="display: none"
      @change="onFileSelected('video', $event)"
    >
    <input
      ref="fileInputRef"
      type="file"
      multiple
      style="display: none"
      @change="onFileSelected('file', $event)"
    >
  </div>
</template>

<style>
/* Tiptap 编辑器内容区样式（全局，避免 scoped 穿透问题） */
.rich-input__editor-content {
  min-height: 60px;
  height: var(--rich-input-editor-height, auto);
  max-height: var(--rich-input-editor-max-height, 150px);
  /* 内边距由卡片层提供（--uikit-input-padding-y/x），文本与工具栏图标共用卡片左缘 */
  padding: 0;
  outline: none;
  font-size: var(--uikit-font-size-15);
  line-height: 1.5;
  color: var(--uikit-text-primary);
  overflow-y: auto;
  caret-color: var(--rich-input-caret-color, auto);
}

.rich-input__editor-content ::selection {
  background-color: var(--rich-input-selection-color, revert);
}

.rich-input__editor-content p,
.rich-input__editor-content .rich-input__image,
.rich-input__editor-content .rich-input__attachment {
  margin: 0 0 4px;
}

.rich-input__editor-content > :last-child {
  margin-bottom: 0;
}

.rich-input__editor-content img {
  display: block;
  max-width: 240px;
  max-height: 240px;
  width: auto;
  height: auto;
  object-fit: contain;
  user-select: none;
  border-radius: var(--uikit-bubble-radius, 16px);
}

/* 关掉 ProseMirror 选中原子节点时的浅蓝描边，改用右上角删除按钮 */
.rich-input__editor-content .ProseMirror-selectednode,
.rich-input__editor-content img.ProseMirror-selectednode,
.rich-input__editor-content [data-node-view-wrapper].ProseMirror-selectednode {
  outline: none !important;
  box-shadow: none;
}

.rich-input__media-remove {
  position: absolute;
  top: 6px;
  right: 6px;
  z-index: 2;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  padding: 0;
  color: var(--uikit-text-secondary);
  cursor: pointer;
  background-color: var(--uikit-input-bg, #fff);
  border: 0;
  border-radius: 50%;
}

.rich-input__editor-content.ProseMirror-focused {
  outline: none;
}

.rich-input__editor-content .ProseMirror-gapcursor {
  display: none;
  pointer-events: none;
  position: absolute;
}

.rich-input__editor-content .ProseMirror-gapcursor:after {
  content: '';
  display: block;
  position: absolute;
  top: -2px;
  width: 20px;
  border-top: 1px solid var(--uikit-text-primary);
}
</style>

<style scoped>
.rich-input {
  display: flex;
  flex-direction: column;
  gap: var(--uikit-container-gap, 8px);
  background-color: transparent;
}

/* 工具栏在下：输入框在上 */
.rich-input--toolbar-bottom {
  flex-direction: column-reverse;
}

/* 工具栏在上：输入框在下 */
.rich-input--toolbar-top {
  flex-direction: column;
}

.rich-input__toolbar {
  display: flex;
  align-items: center;
  /* 28px 热区 + 8px 间距 = 图标视觉间距 16px（设计稿 msg_input actions 行） */
  gap: var(--uikit-container-gap, 8px);
}

/* 展开/收起按钮：固定在工具栏右端 */
.rich-input__expand-btn {
  margin-left: auto;
}

.rich-input__tool-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: var(--uikit-components-radius, 6px);
  cursor: pointer;
  color: var(--uikit-text-secondary);
  transition:
    background-color var(--uikit-anim-duration) var(--uikit-anim-easing),
    color var(--uikit-anim-duration) var(--uikit-anim-easing);
  flex-shrink: 0;
}

@media (hover: hover) {
  .rich-input__tool-btn:hover {
    background-color: var(--uikit-bg-hover);
    color: var(--uikit-text-primary);
  }
}

.rich-input__field-area {
  display: flex;
  align-items: flex-end;
  gap: var(--uikit-container-gap, 8px);
}

.rich-input__editor-wrapper {
  flex: 1;
  position: relative;
  border: none;
  border-radius: var(--uikit-components-radius, 8px);
  background-color: transparent;
}

/* 拖拽手柄：顶部边缘命中区（仅光标提示，不画视觉线） */
.rich-input__resize-handle {
  position: absolute;
  left: 0;
  right: 0;
  top: 0;
  height: 6px;
  z-index: 1;
  cursor: row-resize;
  touch-action: none;
}

.rich-input__placeholder {
  position: absolute;
  top: 0;
  left: 0;
  color: var(--uikit-text-tertiary, #919BA1);
  pointer-events: none;
  /* 占位文字比正文（15px）小一档，对齐抽屉假搜索框 13px 的观感 */
  font-size: var(--uikit-font-size-13);
  line-height: 1.5;
}

.rich-input__voice-btn {
  flex: 1;
  padding: var(--uikit-input-padding-y, 8px) var(--uikit-input-padding-x, 12px);
  border-radius: var(--uikit-input-radius, 999px);
  background-color: var(--uikit-input-bg);
  border: 1px solid var(--uikit-border-color);
  text-align: center;
  font-size: var(--uikit-font-size-13);
  color: var(--uikit-text-primary);
  cursor: pointer;
  user-select: none;
}

.rich-input__voice-btn:active {
  background-color: var(--uikit-bg-hover);
}

.rich-input__actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  padding: 8px 4px 4px 0;
}

.rich-input__panel {
  border-top: 1px solid var(--uikit-border-color);
  padding-top: 8px;
}
</style>
