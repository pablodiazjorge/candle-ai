/** Structured analysis result from the LLM */

export interface SupportResistanceLevel {
  price: number;
  type: 'support' | 'resistance';
  strength: 'weak' | 'moderate' | 'strong';
  description: string;
}

export interface TrendAnalysis {
  direction: 'bullish' | 'bearish' | 'sideways';
  strength: 'weak' | 'moderate' | 'strong';
  description: string;
}

export interface SignalInfo {
  indicator: string;
  signal: 'buy' | 'sell' | 'neutral';
  description: string;
}

export interface RiskAssessment {
  level: 'low' | 'medium' | 'high';
  score: number; // 0-100
  description: string;
}

export interface AnalysisResult {
  ticker: string;
  timeframe: string;
  generatedAt: number; // timestamp
  trend: TrendAnalysis;
  levels: SupportResistanceLevel[];
  signals: SignalInfo[];
  risk: RiskAssessment;
  summary: string; // natural language summary
}
