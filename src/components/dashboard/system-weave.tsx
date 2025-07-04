
'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Sparkles, Line, Edges, Html, Torus } from '@react-three/drei';
import * as THREE from 'three';
import { type Agent as AgentData, AgentStatus, PulsePhase } from '@prisma/client';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/store/app-store';
import type { MicroAppType } from '@/store/app-store';
import Obelisk from './obelisk';

// Configuration for agent node visuals based on status
const statusConfig: Record<AgentStatus, { color: THREE.Color; emissiveIntensity: number }> = {
    [AgentStatus.active]: { color: new THREE.Color('hsl(var(--accent))'), emissiveIntensity: 0.8 },
    [AgentStatus.processing]: { color: new THREE.Color('hsl(var(--primary))'), emissiveIntensity: 1.2 },
    [AgentStatus.idle]: { color: new THREE.Color('hsl(215, 20.2%, 65.1%)'), emissiveIntensity: 0.2 },
    [AgentStatus.paused]: { color: new THREE.Color('hsl(var(--ring))'), emissiveIntensity: 0.6 },
    [AgentStatus.error]: { color: new THREE.Color('hsl(var(--destructive))'), emissiveIntensity: 1.0 },
};

// More robust AgentNode component
function AgentNode({ agent, position, isHighlighted }: { agent: AgentData, position: THREE.Vector3, isHighlighted: boolean }) {
    const { upsertApp } = useAppStore();
    const groupRef = useRef<THREE.Group>(null!);
    const [isHovered, setIsHovered] = useState(false);
    const config = statusConfig[agent.status] || statusConfig.idle;
    const highlightFactor = useRef(0);

    useFrame((state, delta) => {
        const { clock } = state;
        const group = groupRef.current;
        if (!group) return;

        // Animate the highlight factor in/out smoothly
        highlightFactor.current = THREE.MathUtils.lerp(highlightFactor.current, isHighlighted ? 1 : 0, delta * 5);

        // Base pulse animation
        const pulseSpeed = agent.status === AgentStatus.processing ? 4 : 1;
        const pulseIntensity = agent.status === AgentStatus.processing ? 0.25 : 0.1;
        const baseScale = 1 + Math.sin(clock.getElapsedTime() * pulseSpeed) * pulseIntensity;

        // Apply highlight effect on top of base pulse
        const finalScale = baseScale + (highlightFactor.current * 0.4); // Additive pop effect
        group.scale.setScalar(finalScale);

        // Also make it glow more when highlighted
        const material = (group.children[0] as THREE.Mesh).material as THREE.MeshStandardMaterial;
        if (material) {
            const baseIntensity = config.emissiveIntensity;
            const highlightIntensity = 3.0;
            material.emissiveIntensity = THREE.MathUtils.lerp(baseIntensity, highlightIntensity, highlightFactor.current);
        }
    });
    
    const handleNodeClick = (e: any) => {
        e.stopPropagation();
        try {
            const appType = agent.type as MicroAppType;
            upsertApp(appType, { id: `agent-app-${appType}` });
        } catch (e) {
            console.error(`Error launching app for agent type: ${agent.type}`, e);
        }
    };

    return (
        <group 
            ref={groupRef}
            position={position}
            onPointerDown={handleNodeClick}
            onPointerOver={() => setIsHovered(true)}
            onPointerOut={() => setIsHovered(false)}
            className="cursor-pointer"
        >
            <mesh>
              <icosahedronGeometry args={[0.4, 1]} />
              <meshStandardMaterial
                  color={config.color}
                  emissive={config.color}
                  emissiveIntensity={config.emissiveIntensity}
                  metalness={0.8}
                  roughness={0.1}
              />
               <Edges scale={1.001} threshold={15} color="white" />
            </mesh>
            <Html distanceFactor={10}>
                <div
                    className={cn(
                        'transition-opacity duration-300 pointer-events-none p-2 rounded-md text-xs bg-background/70 backdrop-blur-sm border border-border w-32 text-center',
                        isHovered || isHighlighted ? 'opacity-100' : 'opacity-0'
                    )}
                >
                    <p className="font-bold truncate">{agent.name}</p>
                    <p className="capitalize font-medium" style={{ color: config.color.getStyle() }}>{agent.status}</p>
                </div>
            </Html>
        </group>
    );
}

// State-aware BEEP Core component, replacing the old one
type BeepCoreState = 'idle' | 'listening' | 'speaking' | 'alert';

function BeepCore({ state }: { state: BeepCoreState }) {
    const groupRef = useRef<THREE.Group>(null!);
    const coreMeshRef = useRef<THREE.Mesh>(null!);
    const materialRef = useRef<THREE.MeshStandardMaterial>(null!);
    const lightRef = useRef<THREE.PointLight>(null!);
    const ringsRef = useRef<THREE.Group>(null!);

    const targetState = useRef({
        scale: 1,
        color: new THREE.Color('hsl(var(--primary))'),
        emissiveIntensity: 1.5,
        rotationSpeed: 0.2,
    });
    
    useEffect(() => {
        const colors = {
            primary: new THREE.Color('hsl(var(--primary))'),
            accent: new THREE.Color('hsl(var(--accent))'),
            destructive: new THREE.Color('hsl(var(--destructive))'),
        };

        switch (state) {
            case 'listening':
                targetState.current = { scale: 1.1, color: colors.accent, emissiveIntensity: 2.5, rotationSpeed: 1.5 };
                break;
            case 'speaking':
                targetState.current = { scale: 1.1, color: colors.accent, emissiveIntensity: 2.0, rotationSpeed: 0.8 };
                break;
            case 'alert':
                targetState.current = { scale: 1.2, color: colors.destructive, emissiveIntensity: 3.0, rotationSpeed: 5 };
                break;
            default: // idle
                targetState.current = { scale: 1, color: colors.primary, emissiveIntensity: 1.5, rotationSpeed: 0.2 };
                break;
        }
    }, [state]);

    useFrame((state, delta) => {
        const { clock } = state;
        const group = groupRef.current;
        const material = materialRef.current;
        const light = lightRef.current;
        const rings = ringsRef.current;
        if (!group || !material || !light || !rings) return;
        
        group.scale.lerp(new THREE.Vector3(1,1,1).multiplyScalar(targetState.current.scale), 0.1);
        material.color.lerp(targetState.current.color, 0.1);
        material.emissive.lerp(targetState.current.color, 0.1);
        light.color.lerp(targetState.current.color, 0.1);
        material.emissiveIntensity = THREE.MathUtils.lerp(material.emissiveIntensity, targetState.current.emissiveIntensity, 0.1);
        light.intensity = THREE.MathUtils.lerp(light.intensity, targetState.current.emissiveIntensity * 2, 0.1);
        
        group.rotation.y += targetState.current.rotationSpeed * delta * 0.5;

        if(state !== 'idle') {
            const wobbleFactor = state === 'alert' ? 0.3 : 0.1;
            group.rotation.x = THREE.MathUtils.lerp(group.rotation.x, Math.sin(clock.getElapsedTime() * targetState.current.rotationSpeed * 0.5) * wobbleFactor, 0.1);
            group.rotation.z = THREE.MathUtils.lerp(group.rotation.z, Math.cos(clock.getElapsedTime() * targetState.current.rotationSpeed * 0.5) * wobbleFactor, 0.1);
        } else {
             group.rotation.x = THREE.MathUtils.lerp(group.rotation.x, 0, 0.1);
             group.rotation.z = THREE.MathUtils.lerp(group.rotation.z, 0, 0.1);
        }
        
        const ringSpeedMultiplier = state === 'idle' ? 1 : 3;
        if (rings.children[0]) rings.children[0].rotation.x += delta * 0.2 * ringSpeedMultiplier;
        if (rings.children[1]) rings.children[1].rotation.y += delta * 0.3 * ringSpeedMultiplier;
    });

    return (
        <group ref={groupRef}>
            <pointLight ref={lightRef} distance={5} />
            <mesh ref={coreMeshRef}>
                <icosahedronGeometry args={[0.8, 2]} />
                <meshStandardMaterial
                    ref={materialRef}
                    metalness={0.9}
                    roughness={0.1}
                    color='hsl(var(--primary))'
                    emissive='hsl(var(--primary))'
                    transparent
                    opacity={0.9}
                />
                <Edges scale={1.001} threshold={15} color="hsl(var(--primary-foreground))" />
            </mesh>
            <group ref={ringsRef}>
                <Torus args={[1.2, 0.02, 16, 100]} rotation={[Math.PI / 2, 0, 0]}>
                    <meshStandardMaterial color="hsl(var(--accent))" emissive="hsl(var(--accent))" emissiveIntensity={0.5} roughness={0} metalness={0.5} />
                </Torus>
                <Torus args={[1.5, 0.02, 16, 100]} rotation={[Math.PI / 2, Math.PI / 3, 0]}>
                    <meshStandardMaterial color="hsl(var(--roman-aqua))" emissive="hsl(var(--roman-aqua))" emissiveIntensity={0.5} roughness={0} metalness={0.5} />
                </Torus>
            </group>
        </group>
    );
}

function Scene({ agents, beepCoreState, highlightedAgents, pulsePhase, totalCreditsBurned }: { agents: AgentData[], beepCoreState: BeepCoreState, highlightedAgents: Set<string>, pulsePhase: PulsePhase | null, totalCreditsBurned: number }) {
    const orbitControlsRef = useRef<any>(null!);

    useFrame(() => {
        if (orbitControlsRef.current) {
            let targetSpeed = 0.1;
            if (pulsePhase === PulsePhase.CREST) targetSpeed = 0.5;
            if (pulsePhase === PulsePhase.TROUGH) targetSpeed = 0.05;
            
            orbitControlsRef.current.autoRotateSpeed = THREE.MathUtils.lerp(orbitControlsRef.current.autoRotateSpeed, targetSpeed, 0.1);
        }
    });

    const ambientLightIntensity = useMemo(() => {
        if (pulsePhase === PulsePhase.CREST) return 0.5;
        if (pulsePhase === PulsePhase.TROUGH) return 0.1;
        return 0.2;
    }, [pulsePhase]);

    const nodePositions = useMemo(() => {
        return agents.map((agent, index) => {
            const angle = (index / agents.length) * Math.PI * 2;
            const radius = 4 + Math.floor(index / 8) * 1.5; // Increased radius to orbit Obelisk
            const yPos = (Math.random() - 0.5) * 6;
            return new THREE.Vector3(Math.cos(angle) * radius, yPos, Math.sin(angle) * radius)
        });
    }, [agents]);

    return (
        <>
            <ambientLight intensity={ambientLightIntensity} />
            <pointLight position={[0, 0, 0]} color="hsl(var(--primary))" intensity={15} distance={20} />
            
            <Obelisk totalCreditsBurned={totalCreditsBurned} />

            <group position={[0, 0, 3]}>
                <BeepCore state={beepCoreState} />
            </group>

            {agents.map((agent, index) => {
                const isHighlighted = highlightedAgents.has(agent.type);
                return (
                    <group key={agent.id}>
                        <AgentNode agent={agent} position={nodePositions[index]} isHighlighted={isHighlighted} />
                    </group>
                )
            })}
            <Sparkles count={200} scale={20} size={2} speed={0.3} color="hsl(var(--accent))" />
            <OrbitControls ref={orbitControlsRef} autoRotate autoRotateSpeed={0.1} enableZoom={true} enablePan={false} maxDistance={40} minDistance={10} />
        </>
    );
}


export default function SystemWeave({ initialAgents, totalCreditsBurned }: { initialAgents: AgentData[], totalCreditsBurned: number }) {
  const [agents, setAgents] = useState<AgentData[]>(initialAgents);
  const { isLoading, beepOutput } = useAppStore();
  const [beepCoreState, setBeepCoreState] = useState<BeepCoreState>('idle');
  const [highlightedAgents, setHighlightedAgents] = useState<Set<string>>(new Set());
  const audioRef = useRef<HTMLAudioElement>(null);
  const [pulsePhase, setPulsePhase] = useState<PulsePhase | null>(null);

  useEffect(() => {
    const fetchPulse = async () => {
        try {
            const res = await fetch('/api/user/pulse');
            if (res.ok) {
                const data = await res.json();
                setPulsePhase(data.phase);
            }
        } catch (error) {
            console.error("Failed to fetch pulse state for SystemWeave:", error);
        }
    };

    fetchPulse();
    const interval = setInterval(fetchPulse, 30000); // Refresh every 30 seconds
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (beepOutput?.agentReports) {
      const agentTypes = new Set(beepOutput.agentReports.map(r => r.agent));
      setHighlightedAgents(agentTypes);

      const timer = setTimeout(() => {
        setHighlightedAgents(new Set());
      }, 4000); // Highlight for 4 seconds

      return () => clearTimeout(timer);
    }
  }, [beepOutput]);

  useEffect(() => {
    const fetchAgents = async () => {
        try {
            const response = await fetch('/api/agents');
            if (!response.ok) return;
            const data: AgentData[] = await response.json();
            setAgents(data);
        } catch (err) {
            console.error("System Weave agent sync failed:", err);
        }
    };
    const interval = setInterval(fetchAgents, 15000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (isLoading) {
        setBeepCoreState('listening');
    } else if (beepOutput?.agentReports?.some(r => r.agent === 'aegis' && r.report.isAnomalous)) {
        setBeepCoreState('alert');
    } else if (beepOutput?.responseAudioUri) {
        setBeepCoreState('speaking');
    } else {
        setBeepCoreState('idle');
    }
  }, [isLoading, beepOutput]);

  useEffect(() => {
    if (beepCoreState === 'speaking' && beepOutput?.responseAudioUri && audioRef.current) {
        audioRef.current.src = beepOutput.responseAudioUri;
        audioRef.current.play().catch(e => console.error("Audio playback failed:", e));
    }
  }, [beepCoreState, beepOutput?.responseAudioUri]);

  const handleAudioEnd = () => {
      setBeepCoreState('idle');
  };

  return (
      <div className="absolute inset-0 -z-10">
        <Canvas camera={{ position: [0, 8, 18], fov: 60 }}>
            <Scene agents={agents} beepCoreState={beepCoreState} highlightedAgents={highlightedAgents} pulsePhase={pulsePhase} totalCreditsBurned={totalCreditsBurned} />
        </Canvas>
         <audio ref={audioRef} onEnded={handleAudioEnd} className="hidden" />
      </div>
  );
}
