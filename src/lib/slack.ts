import { WebClient } from "@slack/web-api";
import type {
  SlackMetrics,
  ResponseTimeDataPoint,
  ChannelActivity,
  OverloadIndicator,
} from "@/types/slack";
import { formatDate, minutesBetween, daysAgo } from "@/lib/utils";

export async function fetchSlackMetrics(
  channelIds: string[]
): Promise<SlackMetrics> {
  const client = new WebClient(process.env.SLACK_BOT_TOKEN);
  const sevenDaysAgo = Math.floor(daysAgo(7).getTime() / 1000).toString();

  // Fetch user list for name mapping
  const usersRes = await client.users.list({ limit: 200 });
  const userMap = new Map<string, string>();
  for (const user of usersRes.members || []) {
    if (user.id && user.real_name && !user.is_bot) {
      userMap.set(user.id, user.real_name);
    }
  }

  // Fetch channel info and messages
  const channelActivity: ChannelActivity[] = [];
  const allMessages: Array<{
    channelId: string;
    ts: string;
    user?: string;
    threadTs?: string;
  }> = [];

  for (const channelId of channelIds) {
    try {
      // Get channel info
      const channelInfo = await client.conversations.info({
        channel: channelId,
      });
      const channelName = channelInfo.channel?.name || channelId;

      // Get messages from last 7 days
      const history = await client.conversations.history({
        channel: channelId,
        oldest: sevenDaysAgo,
        limit: 200,
      });

      const messages = history.messages || [];
      const uniqueUsers = new Set(messages.map((m) => m.user).filter(Boolean));

      channelActivity.push({
        channelName,
        channelId,
        messagesLast7Days: messages.length,
        activeMembers: uniqueUsers.size,
      });

      for (const msg of messages) {
        allMessages.push({
          channelId,
          ts: msg.ts!,
          user: msg.user,
          threadTs: msg.thread_ts,
        });
      }

      // Get thread replies for response time calculation
      const threadParents = messages.filter(
        (m) => m.reply_count && m.reply_count > 0
      );
      for (const parent of threadParents.slice(0, 10)) {
        try {
          const replies = await client.conversations.replies({
            channel: channelId,
            ts: parent.ts!,
            limit: 5,
          });
          for (const reply of (replies.messages || []).slice(1)) {
            allMessages.push({
              channelId,
              ts: reply.ts!,
              user: reply.user,
              threadTs: parent.ts,
            });
          }
        } catch {
          // Skip if rate limited
        }
      }
    } catch {
      // Skip channels we can't access
    }
  }

  // Response time trend (daily)
  const dailyResponseTimes = new Map<
    string,
    { totalMinutes: number; count: number; messages: number }
  >();

  // Group thread replies to calculate response times
  const threadMessages = allMessages.filter((m) => m.threadTs && m.threadTs !== m.ts);
  for (const reply of threadMessages) {
    const parentMsg = allMessages.find(
      (m) => m.ts === reply.threadTs && m.channelId === reply.channelId
    );
    if (parentMsg) {
      const replyTime = new Date(parseFloat(reply.ts) * 1000);
      const parentTime = new Date(parseFloat(parentMsg.ts) * 1000);
      const responseMin = minutesBetween(parentTime, replyTime);
      const day = formatDate(replyTime);

      const entry = dailyResponseTimes.get(day) || {
        totalMinutes: 0,
        count: 0,
        messages: 0,
      };
      entry.totalMinutes += responseMin;
      entry.count += 1;
      dailyResponseTimes.set(day, entry);
    }
  }

  // Count messages per day
  for (const msg of allMessages) {
    const day = formatDate(new Date(parseFloat(msg.ts) * 1000));
    const entry = dailyResponseTimes.get(day) || {
      totalMinutes: 0,
      count: 0,
      messages: 0,
    };
    entry.messages += 1;
    dailyResponseTimes.set(day, entry);
  }

  const responseTimeTrend: ResponseTimeDataPoint[] = Array.from(
    dailyResponseTimes.entries()
  )
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, data]) => ({
      day,
      avgResponseMinutes:
        data.count > 0
          ? Math.round((data.totalMinutes / data.count) * 10) / 10
          : 0,
      messageCount: data.messages,
    }));

  // Overload indicators
  const userMessageCounts = new Map<
    string,
    { messages: number; channels: Set<string>; responseMinutes: number; responseCount: number }
  >();

  for (const msg of allMessages) {
    if (!msg.user || !userMap.has(msg.user)) continue;
    const entry = userMessageCounts.get(msg.user) || {
      messages: 0,
      channels: new Set<string>(),
      responseMinutes: 0,
      responseCount: 0,
    };
    entry.messages += 1;
    entry.channels.add(msg.channelId);
    userMessageCounts.set(msg.user, entry);
  }

  const messageCounts = Array.from(userMessageCounts.values()).map(
    (u) => u.messages
  );
  const mean =
    messageCounts.length > 0
      ? messageCounts.reduce((s, c) => s + c, 0) / messageCounts.length
      : 0;
  const stdDev =
    messageCounts.length > 1
      ? Math.sqrt(
          messageCounts.reduce((s, c) => s + (c - mean) ** 2, 0) /
            messageCounts.length
        )
      : 0;
  const overloadThreshold = mean + 2 * stdDev;

  const overloadIndicators: OverloadIndicator[] = Array.from(
    userMessageCounts.entries()
  )
    .map(([userId, data]) => ({
      userName: userMap.get(userId) || userId,
      userId,
      messagesSent: data.messages,
      channelsActive: data.channels.size,
      avgResponseMinutes:
        data.responseCount > 0
          ? Math.round((data.responseMinutes / data.responseCount) * 10) / 10
          : 0,
      isOverloaded: data.messages > overloadThreshold,
    }))
    .sort((a, b) => b.messagesSent - a.messagesSent);

  const totalMessages = allMessages.length;
  const avgResponse =
    responseTimeTrend.length > 0
      ? Math.round(
          (responseTimeTrend.reduce((s, r) => s + r.avgResponseMinutes, 0) /
            responseTimeTrend.filter((r) => r.avgResponseMinutes > 0).length ||
            1) * 10
        ) / 10
      : 0;

  return {
    responseTimeTrend,
    channelActivity: channelActivity.sort(
      (a, b) => b.messagesLast7Days - a.messagesLast7Days
    ),
    overloadIndicators,
    summary: {
      totalMessages7Days: totalMessages,
      avgResponseMinutes: avgResponse,
      mostActiveChannel:
        channelActivity.length > 0 ? channelActivity[0].channelName : "N/A",
      potentiallyOverloaded: overloadIndicators.filter((o) => o.isOverloaded)
        .length,
    },
  };
}
