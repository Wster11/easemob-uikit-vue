import Image from '@tiptap/extension-image'
import { VueNodeViewRenderer } from '@tiptap/vue-3'
import ComposerImage from './composer-image.vue'

export const ComposerImageNode = Image.extend({
  inline: false,
  group: 'block',
  atom: true,
  addNodeView() {
    return VueNodeViewRenderer(ComposerImage)
  },
})
