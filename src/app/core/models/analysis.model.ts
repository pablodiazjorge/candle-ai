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

// ─── Confluence Engine Types (Epic 7) ────────────────────────────

export type ConfidenceTier = 'HIGH' | 'MEDIUM' | 'LOW' | 'NEUTRAL';

export type ConfluenceDirection = 'bullish' | 'bearish' | 'neutral';

export interface SignalContribution {
  /** Signal name (e.g., "Double Bottom (A)", "RSI Bullish Divergence") */
  signal: string;
  /** Which direction this signal points */
  direction: ConfluenceDirection;
  /** Raw modifier before regime adjustment */
  baseModifier: number;
  /** Modifier after regime alignment adjustment */
  appliedModifier: number;
  /** Human-readable explanation */
  description: string;
}

export interface RiskParams {
  /** Stop-loss price derived from market structure */
  stopLoss: number | null;
  /** Take-profit price based on risk-reward ratio */
  takeProfit: number | null;
  /** Risk-reward ratio (e.g., 2.0 = 1:2) */
  riskRewardRatio: number | null;
  /** Suggested position size (shares/contracts), null if account size not provided */
  positionSize: number | null;
}

export interface ConfluenceResult {
  /** Bullish or bearish */
  direction: ConfluenceDirection;
  /** Confidence tier */
  tier: ConfidenceTier;
  /** Probability 0.05-0.95 */
  probability: number;
  /** List of signals that contributed, with individual impact */
  contributingSignals: SignalContribution[];
  /** Risk parameters derived from market structure */
  riskParams: RiskParams;
  /** Whether this result used 2026 market overrides */
  overridesApplied: string[];
}
