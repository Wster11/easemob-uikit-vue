import type {
  MessageBody,
  CmdMessageBody,
  CombineMessageBody,
  CustomMessageBody,
  FileMessageBody,
  ImageMessageBody,
  LocationMessageBody,
  MultiBody,
  TextMessageBody,
  VideoMessageBody,
  VoiceMessageBody,
} from './body'

/**
 * 将 MessageBody 联合类型窄化为具体 body 的类型守卫。
 * 由于 wire 层未提供 discriminant 字段，守卫采用组合字段判定，降低不同 body 之间的误匹配风险。
 */

/** 复合消息体：正文是分段数组 */
export function isMultiBody(body: MessageBody): body is MultiBody {
  return Array.isArray(body)
}

/** 文本消息体：包含 content 字段 */
export function isTextBody(body: MessageBody): body is TextMessageBody {
  return !Array.isArray(body) && 'content' in body
}

/** 图片消息体：包含 localUrl，且至少包含一个图片特有字段 */
export function isImageBody(body: MessageBody): body is ImageMessageBody {
  return !Array.isArray(body)
    && 'localUrl' in body
    && (
      'width' in body
      || 'height' in body
      || 'originalImageUrl' in body
      || 'bigImageUrl' in body
      || 'thumbnailUrl' in body
    )
}

/** 文件消息体：包含 url，且不含音视频/位置特有字段 */
export function isFileBody(body: MessageBody): body is FileMessageBody {
  return !Array.isArray(body)
    && 'url' in body
    && !('duration' in body)
    && !('width' in body)
    && !('latitude' in body)
    && !('localUrl' in body)
}

/** 语音消息体：包含 duration，且不含视频/图片特有字段 */
export function isVoiceBody(body: MessageBody): body is VoiceMessageBody {
  return !Array.isArray(body)
    && 'duration' in body
    && !('thumbnailUrl' in body)
    && !('width' in body)
}

/** 视频消息体：包含 duration，且包含缩略图或宽高信息 */
export function isVideoBody(body: MessageBody): body is VideoMessageBody {
  return !Array.isArray(body)
    && 'duration' in body
    && ('thumbnailUrl' in body || 'width' in body)
}

/** 位置消息体：同时包含 latitude 与 longitude */
export function isLocationBody(body: MessageBody): body is LocationMessageBody {
  return !Array.isArray(body) && 'latitude' in body && 'longitude' in body
}

/** 自定义消息体：包含 event，且不含其他 body 类型的判别字段 */
export function isCustomBody(body: MessageBody): body is CustomMessageBody {
  return !Array.isArray(body)
    && 'event' in body
    && !('duration' in body)
    && !('localUrl' in body)
    && !('content' in body)
    && !('title' in body)
}

/** 合并消息体：同时包含 title、summary、filename */
export function isCombineBody(body: MessageBody): body is CombineMessageBody {
  return !Array.isArray(body) && 'title' in body && 'summary' in body && 'filename' in body
}

/** 命令消息体：包含 action，且不含其他 body 类型的判别字段 */
export function isCmdBody(body: MessageBody): body is CmdMessageBody {
  return !Array.isArray(body)
    && 'action' in body
    && !('content' in body)
    && !('localUrl' in body)
    && !('event' in body)
}
