
import { z } from 'zod';

export const KifKrokerAnalysisInputSchema = z.object({
  channelId: z.string().describe('The ID of the Slack channel to analyze (e.g., C012AB3CD).'),
  workspaceId: z.string().describe('The ID of the workspace performing the action.'),
});
export type KifKrokerAnalysisInput = z.infer<typeof KifKrokerAnalysisInputSchema>;

export const KifKrokerAnalysisOutputSchema = z.object({
  moraleLevel: z.enum(['Nominal', 'Strained', 'Tense', 'Sigh']).describe('The overall morale level detected in the conversation.'),
  wearyNudge: z.string().describe("Kif's weary, passive, and duty-bound alert message for a manager."),
  passiveAggressionIndex: z.number().min(0).max(100).describe('A score from 0-100 indicating the level of passive-aggression.'),
  burnoutProbability: z.number().min(0).max(100).describe('A score from 0-100 indicating the probability of team burnout.'),
});
export type KifKrokerAnalysisOutput = z.infer<typeof KifKrokerAnalysisOutputSchema>;
