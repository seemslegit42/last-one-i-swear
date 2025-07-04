'use client';

import React, { useRef, useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Input } from '@/components/ui/input';
import { useIsMobile } from '@/hooks/use-is-mobile';
import { type User, type Workspace, UserPsyche, PulseProfile } from '@prisma/client';
import { useAppStore } from '@/store/app-store';
import { cn } from '@/lib/utils';
import { Button } from '../ui/button';
import { Popover, PopoverContent, PopoverAnchor } from '@/components/ui/popover';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { handleLogout } from '@/app/auth/actions';
import { getUserVas } from '@/app/user/actions';
import { Tooltip, TooltipProvider, TooltipTrigger, TooltipContent } from '../ui/tooltip';
import PsycheMatrix from '../profile/psyche-matrix';
import { Progress } from '../ui/progress';

type UserProp = Pick<User, 'id' | 'email' | 'firstName' | 'lastName' | 'role' | 'agentAlias' | 'psyche'> | null;

interface TopBarProps {
  user: UserProp;
  workspace: Workspace | null;
  initialVas: number | null;
}

const psycheToCovenantMap = {
  [UserPsyche.SYNDICATE_ENFORCER]: { name: 'Motion', symbol: '🜁' },
  [UserPsyche.RISK_AVERSE_ARTISAN]: { name: 'Worship', symbol: '🜃' },
  [UserPsyche.ZEN_ARCHITECT]: { name: 'Silence', symbol: '🜄' },
};

const CurrentTime = () => {
  const [time, setTime] = useState('');

  useEffect(() => {
    const update = () => setTime(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    update();
    const timerId = setInterval(update, 1000 * 60);
    return () => clearInterval(timerId);
  }, []);

  return <span className="hidden lg:inline">{time}</span>;
}

export default function TopBar({ user, workspace, initialVas }: TopBarProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const isMobile = useIsMobile();
  
  // Use granular selectors for performance
  const handleCommandSubmit = useAppStore((state) => state.handleCommandSubmit);
  const isLoading = useAppStore((state) => state.isLoading);
  const beepOutput = useAppStore((state) => state.beepOutput);
  const upsertApp = useAppStore((state) => state.upsertApp);
  const activeAppId = useAppStore((state) => state.activeAppId);
  const apps = useAppStore((state) => state.apps);

  const [inputValue, setInputValue] = useState('');
  const [vas, setVas] = useState<number | null>(initialVas);
  const [pulseProfile, setPulseProfile] = useState<PulseProfile | null>(null);

  // Fetch Pulse Profile for PsycheMatrix
  useEffect(() => {
    async function fetchPulseProfile() {
      if (!user) return;
      try {
        const res = await fetch('/api/user/pulse-profile');
        if (!res.ok) {
            console.error('Failed to fetch pulse profile, it might not exist yet.');
            return;
        }
        const data = await res.json();
        setPulseProfile(data);
      } catch (error) {
        console.error("Error fetching pulse profile for TopBar:", error);
      }
    }
    fetchPulseProfile();
  }, [user]);


  useEffect(() => {
    async function fetchVas() {
        try {
            const userVas = await getUserVas();
            setVas(userVas);
        } catch (error) {
            console.error("Failed to fetch VAS", error);
        }
    }
    if (user) {
        // We still periodically refresh the VAS score
        const interval = setInterval(fetchVas, 30000); 
        return () => clearInterval(interval);
    }
  }, [user]);

  const activeApp = apps.find(app => app.id === activeAppId);
  const activeAppContext = activeApp?.type;

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!inputValue.trim()) return;
    handleCommandSubmit(inputValue, activeAppContext);
    setInputValue('');
  };

  const handleSuggestionClick = (command: string) => {
    handleCommandSubmit(command, activeAppContext);
    setInputValue('');
  }
  
  const handleProfileClick = () => {
    if (user) {
        upsertApp('user-profile-settings', {
            id: 'singleton-user-profile',
            title: `Profile: ${user.firstName || user.email}`,
            contentProps: { user }
        });
    }
  };
  
  const handleBillingClick = () => {
      upsertApp('usage-monitor', { 
          id: 'singleton-usage-monitor',
          contentProps: { workspace, user }
      });
  }

  const agentName = user?.agentAlias || 'BEEP';
  const placeholderText = isMobile ? `${agentName} Command...` : `Ask ${agentName} to...`;
  const displayName = user ? (user.firstName && user.lastName ? `${user.firstName} ${user.lastName}` : user.email) : "Operator";
  const roleText = user?.role ? user.role.charAt(0).toUpperCase() + user.role.slice(1).toLowerCase() : 'Operator';
  const getInitials = () => {
    const first = user?.firstName ? user.firstName.charAt(0) : '';
    const last = user?.lastName ? user.lastName.charAt(0) : '';
    return `${first}${last}`.toUpperCase() || (user?.email ? user.email.charAt(0).toUpperCase() : '');
  }

  return (
    <header className="flex items-center justify-between w-full p-2 bg-background/70 backdrop-blur-xl border border-border/20 shadow-lg rounded-lg gap-2 sm:gap-4">
      <div className="flex items-center gap-3">
        <Link href="/">
            <Image src="/logo.png" alt="Aevon OS Logo" width={32} height={32} />
        </Link>
      </div>

      <div className="flex-1 max-w-xl">
         <Popover open={!!beepOutput?.suggestedCommands && beepOutput.suggestedCommands.length > 0 && !!inputValue}>
          <PopoverAnchor asChild>
            <form ref={formRef} onSubmit={handleSubmit} className="relative w-full group">
              <Input
                name="command"
                type="text"
                placeholder={placeholderText}
                autoComplete="off"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                className={cn(
                  "w-full bg-background/80 text-foreground placeholder:text-muted-foreground border-border/50 h-10 pl-4 pr-4",
                  "focus-visible:ring-1 focus-visible:ring-roman-aqua",
                  isLoading && "ring-1 ring-inset ring-roman-aqua animate-pulse"
                )}
                disabled={isLoading}
              />
            </form>
          </PopoverAnchor>
          <PopoverContent className="p-1 w-[--radix-popover-trigger-width]">
            <p className="p-2 text-xs text-muted-foreground">Suggestions</p>
            {beepOutput?.suggestedCommands?.map((cmd, i) => (
              <Button
                key={i}
                variant="ghost"
                className="w-full justify-start"
                onClick={() => handleSuggestionClick(cmd)}
              >
                {cmd}
              </Button>
            ))}
          </PopoverContent>
        </Popover>
      </div>

      <div className="flex items-center gap-2 sm:gap-4 text-sm text-foreground">
        <div className="hidden md:flex items-center gap-4 text-sm font-lexend">
          <CurrentTime />
          <div className="h-6 w-px bg-border/30" />
          <Button variant="ghost" className="p-0 h-auto hover:bg-transparent text-foreground" onClick={handleProfileClick}>
            <span>{displayName} | {roleText}</span>
          </Button>
           <div className="h-6 w-px bg-border/30" />
            <TooltipProvider>
                 {user && pulseProfile && (
                     <Tooltip>
                        <TooltipTrigger asChild>
                             <div className="w-8 h-8 cursor-pointer" onClick={handleProfileClick}>
                                <PsycheMatrix profile={pulseProfile} psyche={user.psyche} />
                            </div>
                        </TooltipTrigger>
                        <TooltipContent>
                           <p>Your Psyche-Matrix</p>
                        </TooltipContent>
                    </Tooltip>
                 )}
                <Tooltip>
                    <TooltipTrigger asChild>
                         <Button variant="ghost" className="p-2 h-auto hover:bg-transparent text-foreground flex-col gap-0.5" onClick={() => upsertApp('ritual-quests', { id: 'singleton-ritual-quests' })}>
                            <span className="flex items-center gap-1">
                               {user?.psyche && psycheToCovenantMap[user.psyche] ? (
                                    <span className="mr-1 text-lg">{psycheToCovenantMap[user.psyche].symbol}</span>
                                ) : null}
                                <span className="font-bold">{vas ?? '...'}</span>
                                <span className="text-muted-foreground text-xs">VAS</span>
                            </span>
                             <Progress 
                                value={vas ? (vas % 1000) / 10 : 0} 
                                className="h-1 w-12 bg-primary/20" 
                                indicatorClassName="bg-primary"
                            />
                        </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                        <p className="font-semibold">Vow Alignment Score</p>
                        <p className="text-xs text-muted-foreground">Measures alignment with your chosen Covenant.</p>
                        <p className="text-xs text-muted-foreground">Complete Ritual Quests to increase it.</p>
                    </TooltipContent>
                </Tooltip>
            </TooltipProvider>
           <div className="h-6 w-px bg-border/30" />
          <Button variant="ghost" className="p-0 h-auto hover:bg-transparent text-foreground" onClick={handleBillingClick}>
            <span>
              Ξ <span className="text-gilded-accent font-bold">{workspace?.credits ? Number(workspace.credits).toFixed(2) : '0.00'}</span>
            </span>
          </Button>
        </div>
        <div className="flex md:hidden">
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                     <Button variant="ghost" className="relative h-8 w-8 rounded-full">
                        <Avatar className="h-8 w-8">
                            <AvatarFallback>{getInitials()}</AvatarFallback>
                        </Avatar>
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-56" align="end" forceMount>
                     <DropdownMenuLabel className="font-normal">
                        <div className="flex flex-col space-y-1">
                            <p className="text-sm font-medium leading-none">{displayName}</p>
                            <p className="text-xs leading-none text-muted-foreground">
                            {user?.email}
                            </p>
                        </div>
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator />
                     <DropdownMenuItem onClick={handleProfileClick}>
                        Profile
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={handleBillingClick}>
                        Billing & Usage
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                     <DropdownMenuItem onClick={() => handleLogout()}>
                        Log out
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>
        </div>
      </div>
    </header>
  );
}
