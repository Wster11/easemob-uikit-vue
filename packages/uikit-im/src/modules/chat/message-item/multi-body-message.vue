<script setup lang="ts">
import { computed } from 'vue'
import type { Component } from 'vue'
import type { LocationMessageBody, MultiBodySegment, UiMessage } from '@easemob-community/uikit-core'
import { MESSAGE_STATUS, MESSAGE_TYPE } from '@easemob-community/uikit-core'
import TextMessage from './text-message.vue'
import ImageMessage from './image-message.vue'
import VoiceMessage from './voice-message.vue'
import VideoMessage from './video-message.vue'
import FileMessage from './file-message.vue'
import CustomMessage from './custom-message.vue'
import LocationMessage from './location-message.vue'

export interface MultiBodyMessageProps {
  message: UiMessage
}

export interface MultiBodyMessageEmits {
  (e: 'mention-click', userId: string): void
  (e: 'location-click', body: LocationMessageBody, message: UiMessage): void
}

const props = defineProps<MultiBodyMessageProps>()
const emit = defineEmits<MultiBodyMessageEmits>()

const segmentComponentMap: Record<string, Component> = {
  [MESSAGE_TYPE.TEXT]: TextMessage,
  [MESSAGE_TYPE.IMAGE]: ImageMessage,
  [MESSAGE_TYPE.VOICE]: VoiceMessage,
  [MESSAGE_TYPE.VIDEO]: VideoMessage,
  [MESSAGE_TYPE.FILE]: FileMessage,
  [MESSAGE_TYPE.CUSTOM]: CustomMessage,
  [MESSAGE_TYPE.LOCATION]: LocationMessage,
}

const segments = computed(() => {
  const body = props.message.body
  if (!Array.isArray(body))
    return []
  return body.flatMap((segment, index) => {
    if (!segment || typeof segment !== 'object' || !('type' in segment))
      return []
    const typed = segment as MultiBodySegment
    const component = segmentComponentMap[typed.type]
    if (!component)
      return []
    return [{
      key: `${props.message.msgLocalId}-${index}`,
      component,
      message: {
        ...props.message,
        type: typed.type,
        body: typed,
        // 发送中的 loading 只挂在整条消息旁。分段若继承 sending，图片/视频会各自再盖一层。
        status: props.message.status === MESSAGE_STATUS.SENDING
          ? undefined
          : props.message.status,
      } as UiMessage,
    }]
  })
})
</script>

<template>
  <div class="multi-body-message">
    <component
      :is="segment.component"
      v-for="segment in segments"
      :key="segment.key"
      :message="segment.message"
      @mention-click="emit('mention-click', $event)"
      @location-click="(body: LocationMessageBody) => emit('location-click', body, message)"
    />
  </div>
</template>

<style scoped>
.multi-body-message {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
</style>
