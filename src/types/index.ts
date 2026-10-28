export type AssetCategory = 'bonos' | 'acciones' | 'cedears' | 'divisas';

export interface Asset {
  id: string;
  symbol: string;
  name: string;
  category: AssetCategory;
  currency: 'ARS' | 'USD';
  lastPrice: string;
  dayChange: string;
  dayChangePositive: boolean;
  sector?: string;
}

export type RiskProfile = 'conservador' | 'moderado' | 'dinamico';

export type AssetPosition = 'long' | 'short';

export interface Portfolio {
  id: string;
  name: string;
  description: string;
  profile: RiskProfile;
  assetIds: string[];
  assetPositions?: Record<string, AssetPosition>; // e.g. { 'AL30': 'long', 'AAPL': 'short' }
}

/**
 * Returns the impact of a news item tailored to the user's portfolio positions.
 * If user holds a short position on the affected asset, positive asset news becomes an alert,
 * and negative asset news becomes favorable.
 */
export const getEffectiveImpactForPortfolio = (
  baseImpact: NewsImpact,
  affectedAssetIds: string[],
  assetPositions?: Record<string, AssetPosition>
): NewsImpact => {
  if (!assetPositions || !affectedAssetIds || affectedAssetIds.length === 0) {
    return baseImpact;
  }

  // Find if held assets include short positions
  const heldShorts = affectedAssetIds.filter(id => assetPositions[id] === 'short');
  const heldLongs = affectedAssetIds.filter(id => assetPositions[id] === 'long');

  // If exclusively short on the affected assets, invert the polarity
  if (heldShorts.length > 0 && heldLongs.length === 0) {
    if (baseImpact === 'favorable' || baseImpact === 'positivo') return 'alerta';
    if (baseImpact === 'alerta' || baseImpact === 'negativo') return 'favorable';
  }

  return baseImpact;
};

export type NewsImpact = 'favorable' | 'alerta' | 'neutral' | 'positivo' | 'negativo' | 'neutro';
export type QualitativeDirection = 'favorable' | 'alerta' | 'neutral';

export const getQualitativeImpactLabel = (impact: string): string => {
  if (impact === 'favorable' || impact === 'positivo') {
    return 'Favorable';
  }
  if (impact === 'alerta' || impact === 'negativo') {
    return 'Alerta';
  }
  return 'Neutral';
};
export interface NotificationAlert {
  id: string;
  newsId?: string;
  calendarEventId?: string;
  title: string;
  timeAgo: string;
  impact: NewsImpact;
  read: boolean;
  affectedHoldings: string;
  reason?: string;
  mediaName?: string;
  publishedTime?: string;
  sourceUrl?: string;
  alertType?: 'noticia_adversa' | 'calendario_riesgo' | 'correccion_desmentida' | 'discrepancia_medios' | 'favorable' | 'neutral';
}

export type RelevanceType = 
  | 'impacto_precio' 
  | 'valoracion_mercado' 
  | 'ruido' 
  | 'contexto_macro';

export interface MediaCoverage {
  mediaName: string;
  originalHeadline: string;
  sourceUrl: string;
  publishedTime?: string;
  editorialAngle?: string;
  domain?: string;
}

export interface FactCheck {
  status: 'confirmado' | 'en_analisis' | 'rumor_descartado';
  officialSource: string;
  credibilityScore?: number;
  detail: string;
}

export interface PortfolioImpactAnalysis {
  directExplanation: string;
  affectedHoldings: {
    symbol: string;
    impactDirection: NewsImpact;
    relationshipDetail: string;
  }[];
  horizon?: string;
}

export interface NewsItem {
  id: string;
  headline: string;
  briefSummary: string;
  fullSynthesis: string[];
  publishedAgo: string;
  timestamp: string;
  coverageCount: number;
  sources: MediaCoverage[];
  affectedAssetIds: string[];
  impact: NewsImpact;
  relevanceType: RelevanceType;
  portfolioImpactAnalysis: PortfolioImpactAnalysis;
  audioDuration: string;
  audioScript: string;
  factCheck: FactCheck;
  topicCategory: 'deuda_soberana' | 'balances' | 'regulaciones_bcra' | 'macro_tasas' | 'cedears_tech' | 'energia';
  isSaved?: boolean;
}

export interface UserPreferences {
  investorProfile: RiskProfile;
  enabledRelevanceTypes: RelevanceType[];
  prioritizedTopics: string[];
  notificationsEnabled: boolean;
  alertOnHighImpactOnly: boolean;
  audioSpeed: number;
}

export type ReminderTiming = 'same_day' | '1_day_before' | '3_days_before' | '1_week_before';

export interface CalendarEvent {
  id: string;
  date: string; // YYYY-MM-DD
  time: string;
  title: string;
  assetSymbol?: string;
  category: 'balance' | 'pago_cupon' | 'macro_bcra' | 'elecciones_politica';
  description: string;
  source: string;
  sourceUrl?: string;
  impactLevel: 'alto' | 'medio' | 'bajo';
  status?: 'confirmada' | 'estimada' | 'realizado';
  isMacro?: boolean;
  isCustom?: boolean;
  userAction?: 'comprar' | 'vender' | 'cobro' | 'otro';
  note?: string;
  reminders?: ReminderTiming[];
  remindedTimes?: string[];
}

export interface CustomCalendarEvent {
  id: string;
  date: string; // YYYY-MM-DD
  time?: string;
  assetSymbol: string;
  action: 'comprar' | 'vender' | 'cobro' | 'otro';
  note?: string;
  reminders: ReminderTiming[];
  remindedTimes?: string[];
  createdAt: number;
}

export type UserPlan = 'ninguno' | 'prueba' | 'market' | 'partner';
export type FunnelStage = 'cuenta_creada' | 'adoption' | 'interes' | 'venta' | 'farming';

export interface UserAccount {
  id: string;
  name: string;
  email: string;
  birthDate?: string;
  country?: string;
  city?: string;
  phone?: string;
  timeZone: string;
  termsAccepted: boolean;
  notificationsOptIn?: boolean;
  profile: RiskProfile;
  alyc?: string;
  portfolio: Portfolio;
  preferences?: UserPreferences;
  provider?: 'email' | 'google' | 'microsoft';
  googleSub?: string;
  microsoftOid?: string;
  picture?: string;
  createdAt: string;
  plan?: UserPlan;
  funnelStage?: FunnelStage;
  lastActiveAt?: string;
  isAdmin?: boolean;
}

export interface OnboardingAssetEntry {
  symbol: string;
  name?: string;
  category?: AssetCategory;
  quantity?: number;
  avgPrice?: number;
  buyDate?: string;
}

export interface OnboardingDraft {
  step: number;
  provider?: 'email' | 'google' | 'microsoft';
  name: string;
  email: string;
  password?: string;
  birthDate: string;
  country: string;
  city: string;
  phone?: string;
  timeZone: string;
  termsAccepted: boolean;
  notificationsOptIn: boolean;
  profile: RiskProfile;
  alyc: string;
  portfolioName: string;
  currency: 'ARS' | 'USD';
  assets: OnboardingAssetEntry[];
  sectors: string[];
}

export interface AudioTrack {
  id: string;
  title: string;
  subtitle?: string;
  durationText: string;
  totalSeconds: number;
  script?: string;
}

export type UsageEventType = 
  | 'signup'
  | 'login'
  | 'logout'
  | 'account_delete'
  | 'password_reset_request'
  | 'onboarding_step_1'
  | 'onboarding_step_2'
  | 'first_pulse_view'
  | 'news_pulse_query'
  | 'calendar_view'
  | 'calendar_custom_event'
  | 'audio_synthesis'
  | 'audio_play'
  | 'news_detail_open'
  | 'news_bookmark'
  | 'filter_applied'
  | 'source_click'
  | 'asset_added'
  | 'asset_removed'
  | 'long_short_toggled'
  | 'portfolio_created'
  | 'profile_changed'
  | 'notifications_toggled';

export interface UsageEvent {
  id: string;
  userId?: string | null;
  eventType: UsageEventType | string;
  metadata?: Record<string, any>;
  timestamp: number;
  dateIso: string;
  userAgent?: string;
}


