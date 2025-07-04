
import { z } from 'zod';
import { FirecrawlerReportSchema } from './firecrawler-schemas';

// Schema for HaveIBeenPwned check
export const PwnedCheckInputSchema = z.object({
  email: z.string().email().describe('The email address to check for breaches.'),
});
export const BreachSchema = z.object({
  name: z.string().describe('The name of the breach.'),
  domain: z.string().describe('The domain of the breached site.'),
  breachDate: z.string().describe('The date of the breach.'),
  description: z.string().describe('A description of the breach.'),
});
export const PwnedCheckOutputSchema = z.array(BreachSchema).describe('A list of breaches the email was found in.');

// Schema for social media scraping
export const SocialScrapeInputSchema = z.object({
  profileUrl: z.string().url().describe('The URL of the social media profile to scrape (Instagram, TikTok, GitHub, LinkedIn).'),
});
export const SocialScrapeOutputSchema = z.object({
  platform: z.string().describe('The social media platform.'),
  username: z.string().describe('The username on the platform.'),
  fullName: z.string().describe('The full name associated with the profile.'),
  bio: z.string().describe('The profile biography.'),
  recentPosts: z.array(z.string()).describe('A summary of recent posts or activities.'),
  followerCount: z.number().describe('The number of followers.'),
});

// Schema for burner phone number check
export const BurnerCheckInputSchema = z.object({
  phoneNumber: z.string().describe('The phone number to check against the burner database.'),
});
export const BurnerCheckOutputSchema = z.object({
  isBurner: z.boolean().describe('Whether the number is identified as a burner phone.'),
  carrier: z.string().optional().describe('The carrier of the phone number.'),
  country: z.string().optional().describe('The country of the phone number.'),
});

// Schema for IntelX search
export const IntelXSearchInputSchema = z.object({
  searchTerm: z.string().describe('The search term (e.g., email, username, domain) for the intelligence leak database.'),
});
export const IntelXLeakSchema = z.object({
    source: z.string().describe('The source of the leak (e.g., a specific forum or database).'),
    date: z.string().describe('The date the leak was discovered.'),
    details: z.string().describe('Details about the leaked information.'),
});
export const IntelXSearchOutputSchema = z.array(IntelXLeakSchema).describe('A list of discovered data leaks.');
