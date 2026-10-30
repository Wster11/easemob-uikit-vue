import { Extension, type Editor } from '@tiptap/core'

function ensureTrailingParagraph(editor: Editor) {
  const last = editor.state.doc.lastChild
  if (!last || last.type.name === 'paragraph')
    return
  const paragraph = editor.schema.nodes.paragraph
  if (!paragraph)
    return
  editor.view.dispatch(editor.state.tr.insert(editor.state.doc.content.size, paragraph.create()))
}

/**
 * 媒体块是 atom，末尾没有段落时无法打字。
 * 始终在文档最后补一个空段落，且不改当前选区（避免挡住 Backspace 删图）。
 */
export const ComposerTrailingParagraph = Extension.create({
  name: 'composerTrailingParagraph',

  onCreate() {
    ensureTrailingParagraph(this.editor)
  },

  onUpdate() {
    ensureTrailingParagraph(this.editor)
  },
})
