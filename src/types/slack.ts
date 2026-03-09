export interface ResponseTimeDataPoint {
  day: string;
  avgResponseMinutes: number;
  messageCount: number;
}

export interface ChannelActivity {
  channelName: string;
  channelId: string;
  messagesLast7Days: number;
  activeMembers: number;
}

export interface OverloadIndicator {
  userName: string;
  userId: string;
  messagesSent: number;
  channelsActive: number;
  avgResponseMinutes: number;
  isOverloaded: boolean;
}

export interface SlackMetrics {
  responseTimeTrend: ResponseTimeDataPoint[];
  channelActivity: ChannelActivity[];
  overloadIndicators: OverloadIndicator[];
  summary: {
    totalMessages7Days: number;
    avgResponseMinutes: number;
    mostActiveChannel: string;
    potentiallyOverloaded: number;
  };
}
