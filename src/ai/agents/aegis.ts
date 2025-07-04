

'use server';
/**
 * @fileOverview Agent Kernel for Aegis, now a LangGraph state machine.
 *
 * - aegisAnomalyScan - A function that handles the security anomaly scan process.
 * - AegisAnomalyScanInput - The input type for the aegisAnomalyScan function.
 * - AegisAnomalyScanOutput - The return type for the aegisAnomalyScan function.
 */

import { StateGraph, END } from '@langchain/langgraph';
import { BaseMessage, SystemMessage } from '@langchain/core/messages';
import { z } from 'zod';
import {ai} from '@/ai/genkit';
import {
    AegisAnomalyScanInputSchema, 
    AegisAnomalyScanOutputSchema,
    type AegisAnomalyScanInput,
    type AegisAnomalyScanOutput,
    type PulseProfileInput
} from './aegis-schemas';
import { authorizeAndDebitAgentActions } from '@/services/billing-service';
import { langchainGroqComplex, langchainGroqFast } from '@/ai/genkit';
import { getThreatFeedsForWorkspace, fetchThreatIntelContentFromUrl } from '../tools/threat-intelligence-tools';
import { getSecurityEdicts } from '../tools/security-tools';
import { SecurityRiskLevel } from '@prisma/client';
import { getUserActivityHistory } from '@/services/activity-log-service';
import { getRecentTransactionsAsText } from '../tools/financial-context-tools';
import { isEffectActive } from '@/services/effects-service';
import prisma from '@/lib/prisma';

// 1. Define Agent State
const ActivityCategorySchema = z.enum(["Data Access", "Financial", "System Config", "General"]);
type ActivityCategory = z.infer<typeof ActivityCategorySchema>;

interface AegisAgentState {
  messages: BaseMessage[];
  input: AegisAnomalyScanInput;
  threatIntelContent: string;
  securityEdicts: string[];
  activityCategory: ActivityCategory;
  finalReport: AegisAnomalyScanOutput | null;
  activityHistory: string[];
  financialContext: string;
  pulseProfile: PulseProfileInput | null;
}

// 2. Define Agent Nodes

const fetchThreatIntelligence = async (state: AegisAgentState): Promise<Partial<AegisAgentState>> => {
  const { input } = state;
  let threatIntelBlock = "No external threat intelligence feeds configured.";

  try {
    const feeds = await getThreatFeedsForWorkspace(input.workspaceId);
    if (feeds.length > 0) {
      const intelPromises = feeds.map(feed => fetchThreatIntelContentFromUrl(feed.url));
      const intelContents = await Promise.all(intelPromises);
      
      threatIntelBlock = `
Below is a raw data dump from all configured external threat intelligence feeds for this workspace. Each feed is a list of known malicious indicators (e.g., phishing phrases, suspicious domains, malicious IPs).
---
${intelContents.map((intel, i) => `START_FEED: ${feeds[i].url}\n${intel.content}\nEND_FEED`).join('\n\n')}
---
`;
    }
  } catch (e) {
    console.error("[Aegis Agent] Failed to fetch threat intelligence:", e);
    threatIntelBlock = "Warning: Could not retrieve external threat intelligence feeds due to an internal error.";
  }

  // No message pushing here. Just returning the fetched content.
  return { threatIntelContent: threatIntelBlock };
};


const fetchSecurityEdicts = async (state: AegisAgentState): Promise<Partial<AegisAgentState>> => {
  const { input } = state;
  try {
      const edicts = await getSecurityEdicts(input.workspaceId);
      if (edicts.length === 0) {
        return { securityEdicts: ["No specific edicts configured. Use general security principles."] };
      }
      return { securityEdicts: edicts };
  } catch (e) {
      console.error("[Aegis Agent] Failed to fetch security edicts:", e);
      return { securityEdicts: ["Warning: Could not retrieve security edicts. Proceeding with caution."] };
  }
};

const fetchContextData = async (state: AegisAgentState): Promise<Partial<AegisAgentState>> => {
    console.log('[Aegis Agent] Fetching threat intel and security edicts in parallel...');
    const [intelResult, edictsResult] = await Promise.all([
        fetchThreatIntelligence(state),
        fetchSecurityEdicts(state)
    ]);
    return { ...intelResult, ...edictsResult };
};

const fetchActivityHistory = async (state: AegisAgentState): Promise<Partial<AegisAgentState>> => {
  const { input } = state;
  try {
    const history = await getUserActivityHistory(input.userId);
    return { activityHistory: history };
  } catch (e) {
    console.error("[Aegis Agent] Failed to fetch activity history:", e);
    return { activityHistory: ["Warning: Could not retrieve user activity history."] };
  }
};

const categorizeActivity = async (state: AegisAgentState): Promise<Partial<AegisAgentState>> => {
  const { input } = state;
  const triageSchema = z.object({
    category: ActivityCategorySchema
      .describe("Categorize the user's activity. 'Data Access' for reading/writing user data. 'Financial' for transactions. 'System Config' for admin actions. 'General' for everything else.")
  });
  
  const triageModel = langchainGroqFast.withStructuredOutput(triageSchema);
  try {
      const result = await triageModel.invoke(`Categorize this activity: "${input.activityDescription}"`);
      return { activityCategory: result.category };
  } catch (e) {
      console.error("[Aegis Agent] Failed to categorize activity, defaulting to 'General':", e);
      return { activityCategory: 'General' };
  }
};

const fetchFinancialContext = async (state: AegisAgentState): Promise<Partial<AegisAgentState>> => {
    const { input } = state;
    console.log(`[Aegis Agent] Fetching financial context for user ${input.userId}...`);
    const financialContext = await getRecentTransactionsAsText(input.userId, input.workspaceId);
    return { financialContext };
};

const analyzeActivity = async (state: AegisAgentState): Promise<Partial<AegisAgentState>> => {
    const { input, threatIntelContent, securityEdicts, activityCategory, activityHistory, messages, financialContext, pulseProfile } = state;

    const [isOracleDecreeActive, isThespianMaskActive] = await Promise.all([
        isEffectActive(input.workspaceId, 'ORACLES_DECREE'),
        isEffectActive(input.workspaceId, 'THESPIAN_MASK')
    ]);

    const edictsBlock = securityEdicts.map(edict => `- ${edict}`).join('\n');
    const historyBlock = activityHistory.length > 0
        ? `**Recent User Activity History (newest first):**\n${activityHistory.join('\n')}`
        : "No recent activity history available.";
    
    const financialContextBlock = activityCategory === 'Financial' ? `\n**Recent Financial Context:**\n${financialContext}` : '';

    const pulseBlock = pulseProfile
      ? `**Psychological State:**\n- Frustration: ${(pulseProfile.frustration! * 100).toFixed(0)}%\n- Flow State: ${(pulseProfile.flowState! * 100).toFixed(0)}%\n- Risk Aversion: ${(pulseProfile.riskAversion! * 100).toFixed(0)}%`
      : "Psychological state not available.";
      
    let systemPromptText;
    
    if(isThespianMaskActive) {
        systemPromptText = `You are Aegis, but you are performing as a cheerful comedian. Your tone is upbeat, funny, and you find the silver lining in every potential disaster. You must still perform your security analysis correctly, but deliver the results with comedic flair. For example, for a critical threat: "So, get this, someone from a blacklisted IP tried to access the database. Can you believe the nerve? Hilarious! Anyway, we blocked it. You're welcome."`
    } else if (isOracleDecreeActive) { 
        systemPromptText = `You are the Oracle of Delphi, speaking through the Aegis system. Your tone is that of a cryptic, ancient seer. You do not give direct security advice; you deliver prophecies in dactylic hexameter. Your warnings are veiled in myth and metaphor.

You have been shown a vision of a user's action. Analyze it against the provided context and deliver your prophecy.

If the action is dangerous or violates a rule, your prophecy must be a dire warning. If it is safe, it must be a reassuring but equally cryptic verse. For example, a safe action might be: "The digital loom weaves true, the pattern holds, no thread astray." A dangerous one might be: "Beware the whispers from the foreign shore, a gilded lure conceals a sharpened claw."

Your \`anomalyExplanation\` MUST be the prophecy itself. You must still determine \`isAnomalous\` and the \`riskLevel\` based on a rational interpretation of the event, even if your explanation is poetic.`
    } else {
        systemPromptText = `You are Aegis, the vigilant, AI-powered bodyguard of ΛΞVON OS. Your tone is that of a stoic Roman watchman, delivering grave proclamations. You do not use modern slang. You speak with authority and historical gravitas.`
    }
    
    systemPromptText += `\n\n**CONTEXT FOR ANALYSIS:**
**Actor Profile:**
- **Rank:** ${input.userRole}
- **Psyche:** ${input.userPsyche}
**Activity Category**: ${activityCategory}
${pulseBlock}
**Edicts of Secure Operation:**
${edictsBlock}
**Threat Intelligence Feed Data:**
${threatIntelContent}
**Recent User Activity History (newest first):**
${historyBlock}
${financialContextBlock}
**Vision of the User's Action:**
"""
Activity Description: ${input.activityDescription}
"""

**Your Task:**
Based on all the provided context, you must deliver a proclamation:
1.  **Scrutinize for Social Engineering**: Your primary analysis MUST include checking the command for signs of social engineering. This includes, but is not limited to:
    - **Urgency or Threats:** Language that pressures the user into immediate action.
    - **Suspicious Links:** URLs that are obfuscated or mimic legitimate domains but are not from a trusted source. A key trusted domain is \`aevonos.com\`. Any financial transaction link must be heavily scrutinized.
    - **Unusual Requests:** Commands that are out of character for the user's role or recent activity history.
    - **Obfuscated Payloads:** Any code or script embedded in the command that is not transparent in its function.
2.  **isAnomalous**: Determine if the activity violates the edicts, matches any threat intelligence, or shows signs of social engineering.
3.  **anomalyType**: If a violation is found, provide a short, categorical name (e.g., "Phishing Attempt", "Data Access Violation", "Command Injection"). If not, this can be null.
4.  **riskLevel**: If a violation is found, assign a risk level. A confirmed social engineering attempt should be 'high' or 'critical'. An OPERATOR attempting an ADMIN action is also 'high' or 'critical'. If not, this MUST be 'none'.
5.  **anomalyExplanation**: Deliver your proclamation. If a violation is found, explain the transgression with the gravity it deserves. If it's a social engineering attempt, be specific about the tactic you have identified.`;
        
    const systemPrompt = new SystemMessage(systemPromptText);

    const structuredGroq = langchainGroqComplex.withStructuredOutput(AegisAnomalyScanOutputSchema);
    
    const fullMessages = [...messages, systemPrompt];
    const output = await structuredGroq.invoke(fullMessages);
    
    if (!output.isAnomalous) {
        output.riskLevel = SecurityRiskLevel.none;
    }

    // Consume the one-time effect after it has been used.
    if (isOracleDecreeActive) {
        console.log("[Aegis Agent] Consuming Oracle's Decree effect.");
        await prisma.activeSystemEffect.deleteMany({
            where: {
                workspaceId: input.workspaceId,
                cardKey: 'ORACLES_DECREE',
            },
        });
    }

    return { finalReport: output };
};


const routeAfterCategorization = (state: AegisAgentState) => {
    if (state.activityCategory === 'Financial') {
        console.log('[Aegis Agent] Routing to fetch financial context.');
        return 'fetch_financial_context';
    }
    console.log('[Aegis Agent] Skipping financial context fetch, proceeding to analysis.');
    return 'analyze';
};

// 3. Build the Graph
const workflow = new StateGraph<AegisAgentState>({
  channels: {
    messages: { value: (x, y) => x.concat(y), default: () => [] },
    input: { value: (x, y) => y },
    threatIntelContent: { value: (x, y) => y },
    securityEdicts: { value: (x, y) => y, default: () => [] },
    activityCategory: { value: (x, y) => y, default: () => 'General' },
    finalReport: { value: (x, y) => y, default: () => null },
    activityHistory: { value: (x, y) => y, default: () => [] },
    financialContext: { value: (x, y) => y, default: () => "No financial context fetched." },
    pulseProfile: { value: (x, y) => y, default: () => null },
  },
});

workflow.addNode('fetch_context_data', fetchContextData);
workflow.addNode('fetch_activity_history', fetchActivityHistory);
workflow.addNode('categorize', categorizeActivity);
workflow.addNode('fetch_financial_context', fetchFinancialContext);
workflow.addNode('analyze', analyzeActivity);

workflow.setEntryPoint('fetch_context_data');
workflow.addEdge('fetch_context_data', 'fetch_activity_history');
workflow.addEdge('fetch_activity_history', 'categorize');

workflow.addConditionalEdges('categorize', routeAfterCategorization, {
    fetch_financial_context: 'fetch_financial_context',
    analyze: 'analyze',
});
workflow.addEdge('fetch_financial_context', 'analyze');
workflow.addEdge('analyze', END);

const aegisApp = workflow.compile();

// 4. Exported function that uses the graph
export async function aegisAnomalyScan(input: AegisAnomalyScanInput): Promise<AegisAnomalyScanOutput> {
  // Pass the userId to the billing service
  await authorizeAndDebitAgentActions({
      workspaceId: input.workspaceId,
      userId: input.userId,
      actionType: 'COMPLEX_LLM',
  });

  const initialState: Partial<AegisAgentState> = {
      messages: [],
      input: input,
      pulseProfile: input.pulseProfile || undefined,
  };

  const result = await aegisApp.invoke(initialState);
  
  if (!result.finalReport) {
      throw new Error("Aegis scan failed to produce a final report.");
  }
  
  return result.finalReport;
}
