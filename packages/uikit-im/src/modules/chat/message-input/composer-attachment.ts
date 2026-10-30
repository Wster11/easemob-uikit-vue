import { mergeAttributes, Node } from '@tiptap/core'
import { VueNodeViewRenderer } from '@tiptap/vue-3'
import ComposerAttachmentView from './composer-attachment.vue'

export interface ComposerAttachmentAttrs {
  src: string
  kind: 'file' | 'video'
  filename: string
  filesize: number
}

/** 富文本里的文件/视频块。图片仍走 Image 扩展，三者都按文档顺序发送。 */
export const ComposerAttachment = Node.create({
  name: 'composerAttachment',
  group: 'block',
  atom: true,
  draggable: true,
  selectable: true,

  addAttributes() {
    return {
      src: { default: '' },
      kind: { default: 'file' },
      filename: { default: '' },
      filesize: { default: 0 },
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-composer-embed]' }]
  },

  renderHTML({ HTMLAttributes }) {
    const kind = HTMLAttributes.kind === 'video' ? 'video' : 'file'
    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        'data-composer-embed': kind,
        class: `rich-input__embed rich-input__embed--${kind}`,
        contenteditable: 'false',
      }),
    ]
  },

  addNodeView() {
    return VueNodeViewRenderer(ComposerAttachmentView)
  },
})
