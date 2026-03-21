import React, { useState, useEffect, useRef } from 'react';
import { 
  Activity, 
  BookOpen, 
  Brain, 
  ChevronRight, 
  Clock, 
  Compass, 
  Cpu, 
  Layers, 
  Layout, 
  LogOut, 
  MessageSquare, 
  Radar, 
  Settings, 
  Shield, 
  Zap,
  Maximize2,
  Minimize2,
  Terminal,
  Globe,
  Dna,
  Atom,
  Sparkles,
  ArrowUpRight
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer
} from 'recharts';
import { cn } from './lib/utils';
import { View, Message } from './types';

// --- Mock Data ---
const TELEMETRY_DATA = [
  { time: '00:00', focus: 65, flow: 40, drift: 10 },
  { time: '00:10', focus: 85, flow: 60, drift: 5 },
  { time: '00:20', focus: 92, flow: 85, drift: 2 },
  { time: '00:30', focus: 78, flow: 70, drift: 15 },
  { time: '00:40', focus: 88, flow: 80, drift: 8 },
  { time: '00:50', focus: 95, flow: 90, drift: 2 },
  { time: '01:00', focus: 82, flow: 75, drift: 12 },
];

const NEURAL_NODES = [
  { id: 1, label: 'Quantum Physics', progress: 85, x: 20, y: 30, color: 'var(--color-mint)' },
  { id: 2, label: 'Neural Networks', progress: 62, x: 50, y: 20, color: 'var(--color-lemon)' },
  { id: 3, label: 'Cognitive Psych', progress: 45, x: 80, y: 40, color: 'var(--color-periwinkle)' },
  { id: 4, label: 'Bio-Mechanics', progress: 30, x: 30, y: 70, color: 'var(--color-lavender)' },
  { id: 5, label: 'Astrophysics', progress: 15, x: 70, y: 80, color: 'var(--color-mint)' },
];

// --- Components ---

const VerticalRail = ({ activeView, setView }: { activeView: View, setView: (v: View) => void }) => {
  const items = [
    { id: 'command', icon: Layout, label: 'COMMAND_CENTER' },
    { id: 'workspace', icon: Zap, label: 'NEURAL_WORK' },
    { id: 'neural-map', icon: Globe, label: 'NEURAL_MAP' },
    { id: 'settings', icon: Settings, label: 'SYSTEM_CFG' },
  ];

  return (
    <nav className="fixed left-0 top-0 h-screen w-20 flex flex-col items-center py-8 glass border-r border-white/5 z-50">
      <div className="mb-12 relative">
        <div className="w-10 h-10 rounded-full bg-mint/20 flex items-center justify-center">
          <Radar className="w-6 h-6 text-mint animate-pulse" />
        </div>
      </div>

      <div className="flex-1 flex flex-col gap-8">
        {items.map((item) => (
          <button
            key={item.id}
            onClick={() => setView(item.id as View)}
            className={cn(
              "group relative flex flex-col items-center gap-2 transition-all duration-500",
              activeView === item.id ? "text-mint" : "text-zinc-500 hover:text-zinc-300"
            )}
          >
            <item.icon className={cn(
              "w-6 h-6 transition-transform duration-500 group-hover:scale-110",
              activeView === item.id && "drop-shadow-[0_0_8px_rgba(152,232,158,0.5)]"
            )} />
            <span className="text-rail text-[9px] font-mono tracking-widest uppercase opacity-0 group-hover:opacity-100 transition-opacity duration-500 absolute left-12 whitespace-nowrap">
              {item.label}
            </span>
            {activeView === item.id && (
              <motion.div
                layoutId="active-rail"
                className="absolute -left-4 w-1 h-8 bg-mint rounded-r-full"
                transition={{ type: "spring", stiffness: 300, damping: 30 }}
              />
            )}
          </button>
        ))}
      </div>

      <button className="text-zinc-500 hover:text-lavender transition-colors duration-300 group">
        <LogOut className="w-6 h-6 group-hover:-translate-x-1 transition-transform" />
      </button>
    </nav>
  );
};

const NeuralCommand = () => {
  return (
    <div className="grid grid-cols-12 gap-6 p-8 h-full overflow-y-auto custom-scrollbar">
      {/* Header Readout */}
      <motion.div 
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="col-span-12 flex items-end justify-between mb-8 border-b border-white/5 pb-4"
      >
        <div>
          <h1 className="text-5xl font-bold tracking-tighter text-white">
            PILOT_<span className="text-mint">01</span>
          </h1>
          <p className="font-mono text-xs text-zinc-500 mt-2 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-mint animate-pulse" />
            NEURAL_LINK_ESTABLISHED // LATENCY: 14ms
          </p>
        </div>
        <div className="flex gap-12 font-mono">
          <div className="text-right">
            <div className="text-[10px] text-zinc-500 uppercase tracking-widest">Focus_Efficiency</div>
            <div className="text-2xl font-bold text-mint">94.2%</div>
          </div>
          <div className="text-right">
            <div className="text-[10px] text-zinc-500 uppercase tracking-widest">Neural_Load</div>
            <div className="text-2xl font-bold text-periwinkle">42%</div>
          </div>
        </div>
      </motion.div>

      {/* Main Telemetry */}
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="col-span-8 glass p-8 relative overflow-hidden group"
      >
        <div className="absolute inset-0 neural-grid opacity-20 group-hover:opacity-30 transition-opacity" />
        <div className="relative z-10">
          <div className="flex items-center justify-between mb-8">
            <h3 className="text-lg font-bold flex items-center gap-2 text-white">
              <Activity className="w-5 h-5 text-mint" />
              NEURAL_TELEMETRY_STREAM
            </h3>
            <div className="flex gap-4">
              <div className="flex items-center gap-2 text-[10px] font-mono text-zinc-400">
                <div className="w-2 h-2 rounded-full bg-mint" /> FOCUS
              </div>
              <div className="flex items-center gap-2 text-[10px] font-mono text-zinc-400">
                <div className="w-2 h-2 rounded-full bg-periwinkle" /> FLOW
              </div>
            </div>
          </div>
          
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={TELEMETRY_DATA}>
                <defs>
                  <linearGradient id="colorFocus" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--color-mint)" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="var(--color-mint)" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="colorFlow" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--color-periwinkle)" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="var(--color-periwinkle)" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#ffffff05" vertical={false} />
                <XAxis 
                  dataKey="time" 
                  stroke="#ffffff20" 
                  fontSize={10} 
                  tickLine={false} 
                  axisLine={false}
                  fontFamily="JetBrains Mono"
                />
                <YAxis hide />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#050705', border: '1px solid #ffffff10', borderRadius: '12px' }}
                  itemStyle={{ fontSize: '10px', fontFamily: 'JetBrains Mono' }}
                />
                <Area 
                  type="monotone" 
                  dataKey="focus" 
                  stroke="var(--color-mint)" 
                  strokeWidth={3}
                  fillOpacity={1} 
                  fill="url(#colorFocus)" 
                />
                <Area 
                  type="monotone" 
                  dataKey="flow" 
                  stroke="var(--color-periwinkle)" 
                  strokeWidth={3}
                  fillOpacity={1} 
                  fill="url(#colorFlow)" 
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </motion.div>

      {/* Side Stats */}
      <div className="col-span-4 flex flex-col gap-6">
        <motion.div 
          whileHover={{ scale: 1.02 }}
          className="glass p-6"
        >
          <div className="flex items-center gap-4 mb-4">
            <div className="w-12 h-12 rounded-2xl bg-lavender/10 flex items-center justify-center">
              <Brain className="w-6 h-6 text-lavender" />
            </div>
            <div>
              <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">Cognitive_Reserve</div>
              <div className="text-2xl font-bold text-white">88%</div>
            </div>
          </div>
          <div className="w-full h-1 bg-white/5 rounded-full overflow-hidden">
            <motion.div 
              initial={{ width: 0 }}
              animate={{ width: '88%' }}
              className="h-full bg-lavender"
            />
          </div>
        </motion.div>

        <motion.div 
          whileHover={{ scale: 1.02 }}
          className="glass p-6"
        >
          <div className="flex items-center gap-4 mb-4">
            <div className="w-12 h-12 rounded-2xl bg-lemon/10 flex items-center justify-center">
              <Sparkles className="w-6 h-6 text-lemon" />
            </div>
            <div>
              <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">Insight_Velocity</div>
              <div className="text-2xl font-bold text-white">12.4 <span className="text-xs font-normal text-zinc-500">/hr</span></div>
            </div>
          </div>
          <div className="flex gap-1">
            {[1,2,3,4,5,6,7,8].map(i => (
              <div key={i} className={cn("h-4 w-full rounded-sm", i < 6 ? "bg-lemon/40" : "bg-white/5")} />
            ))}
          </div>
        </motion.div>

        <div className="glass p-6 relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-4">
            <Shield className="w-8 h-8 text-mint/10" />
          </div>
          <h4 className="font-mono text-[10px] text-mint uppercase tracking-[0.2em] mb-2">PILOT_SHIELD_ACTIVE</h4>
          <p className="text-sm text-zinc-400 leading-relaxed">
            Distraction vectors minimized. Neural sync optimized for deep analytical work.
          </p>
        </div>
      </div>

      {/* Bottom Grid */}
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="col-span-12 grid grid-cols-4 gap-6"
      >
        {['Sector_A', 'Sector_B', 'Sector_C', 'Sector_D'].map((sector, i) => (
          <div key={sector} className="glass p-4 flex items-center justify-between group cursor-pointer hover:bg-white/[0.05] transition-colors">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center group-hover:bg-mint/20 transition-colors">
                <Terminal className="w-4 h-4 text-zinc-400 group-hover:text-mint" />
              </div>
              <span className="font-mono text-xs text-zinc-400">{sector}</span>
            </div>
            <ChevronRight className="w-4 h-4 text-zinc-600 group-hover:text-zinc-300 transition-transform group-hover:translate-x-1" />
          </div>
        ))}
      </motion.div>
    </div>
  );
};

const NeuralMap = () => {
  return (
    <div className="h-full w-full p-12 flex flex-col">
      <div className="mb-12">
        <h2 className="text-4xl font-bold tracking-tighter text-white">NEURAL_KNOWLEDGE_MAP</h2>
        <p className="font-mono text-xs text-zinc-500 mt-2 uppercase tracking-widest">Visualizing cognitive expansion // Sector: Academic_Core</p>
      </div>

      <div className="flex-1 glass relative overflow-hidden neural-grid">
        <svg className="absolute inset-0 w-full h-full pointer-events-none">
          {NEURAL_NODES.map((node, i) => (
            NEURAL_NODES.slice(i + 1).map((target) => (
              <motion.line
                key={`${node.id}-${target.id}`}
                x1={`${node.x}%`}
                y1={`${node.y}%`}
                x2={`${target.x}%`}
                y2={`${target.y}%`}
                stroke="white"
                strokeWidth="0.5"
                strokeOpacity="0.05"
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ duration: 2, delay: i * 0.2 }}
              />
            ))
          ))}
        </svg>

        {NEURAL_NODES.map((node) => (
          <motion.div
            key={node.id}
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            whileHover={{ scale: 1.1 }}
            className="absolute cursor-pointer group"
            style={{ left: `${node.x}%`, top: `${node.y}%`, transform: 'translate(-50%, -50%)' }}
          >
            <div className="relative">
              <div 
                className="w-16 h-16 rounded-full glass flex items-center justify-center border-2 transition-colors duration-500 group-hover:border-white/40"
                style={{ borderColor: `${node.color}40` }}
              >
                <div 
                  className="w-12 h-12 rounded-full flex items-center justify-center"
                  style={{ backgroundColor: `${node.color}10` }}
                >
                  <Atom className="w-6 h-6" style={{ color: node.color }} />
                </div>
              </div>
              
              <div className="absolute top-full left-1/2 -translate-x-1/2 mt-4 text-center whitespace-nowrap">
                <div className="text-sm font-bold text-white">{node.label}</div>
                <div className="font-mono text-[10px] text-zinc-500 uppercase tracking-widest">{node.progress}% SYNCED</div>
              </div>

              {/* Progress Ring */}
              <svg className="absolute inset-0 w-64 h-64 -rotate-90 pointer-events-none -translate-x-1/2 -translate-y-1/2 left-1/2 top-1/2" viewBox="0 0 100 100">
                <circle
                  cx="50"
                  cy="50"
                  r="45"
                  fill="none"
                  stroke={node.color}
                  strokeWidth="1"
                  strokeDasharray={`${node.progress * 2.82} 282`}
                  className="opacity-20"
                />
              </svg>
            </div>
          </motion.div>
        ))}

        {/* Legend */}
        <div className="absolute bottom-8 right-8 flex flex-col gap-2 glass p-4">
          <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest mb-2">Sync_Status</div>
          {NEURAL_NODES.map(node => (
            <div key={node.id} className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: node.color }} />
              <span className="text-[10px] font-mono text-zinc-400">{node.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

const StudyWorkspace = () => {
  const [isHyperfocus, setIsHyperfocus] = useState(false);
  const [isDrifting, setIsDrifting] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    { id: '1', role: 'assistant', content: "Neural link stable. I've prepared the Quantum Mechanics module. Ready to begin?", timestamp: new Date() }
  ]);
  const [input, setInput] = useState('');

  const handleSend = () => {
    if (!input.trim()) return;
    const userMsg: Message = { id: Date.now().toString(), role: 'user', content: input, timestamp: new Date() };
    setMessages([...messages, userMsg]);
    setInput('');
    
    setTimeout(() => {
      const aiMsg: Message = { id: (Date.now() + 1).toString(), role: 'assistant', content: "Analyzing your query... The wave-particle duality is fundamental to understanding this sector.", timestamp: new Date() };
      setMessages(prev => [...prev, aiMsg]);
    }, 1000);
  };

  return (
    <div className={cn(
      "h-full w-full transition-all duration-1000 relative overflow-hidden",
      isHyperfocus ? "bg-black" : "atmosphere-bg"
    )}>
      <div className="h-full w-full flex gap-6 p-8 relative z-10">
        {/* Main Content Area */}
        <motion.div 
          layout
          className={cn(
            "flex-1 glass flex flex-col relative overflow-hidden transition-all duration-700",
            isHyperfocus ? "border-mint/30" : "border-white/5"
          )}
        >
          {/* Workspace Header */}
          <div className="p-8 border-b border-white/5 flex items-center justify-between bg-white/[0.01]">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-xl bg-mint/10 flex items-center justify-center">
                <BookOpen className="w-5 h-5 text-mint" />
              </div>
              <div>
                <h2 className="text-xl font-bold tracking-tight text-white">Quantum_Mechanics_01</h2>
                <p className="font-mono text-[10px] text-zinc-500 uppercase tracking-widest">Active_Sector // Sub_Node: Wave_Functions</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <button 
                onClick={() => setIsHyperfocus(!isHyperfocus)}
                className={cn(
                  "flex items-center gap-2 px-4 py-2 rounded-full font-mono text-[10px] tracking-widest transition-all duration-500",
                  isHyperfocus ? "bg-mint text-black" : "bg-white/5 text-zinc-400 hover:bg-white/10"
                )}
              >
                <Zap className={cn("w-3 h-3", isHyperfocus && "fill-current")} />
                {isHyperfocus ? "HYPERFOCUS_ACTIVE" : "ENGAGE_HYPERFOCUS"}
              </button>
              <button 
                onClick={() => setIsDrifting(true)}
                className="w-10 h-10 rounded-full glass flex items-center justify-center hover:bg-lavender/20 transition-colors group"
              >
                <Compass className="w-5 h-5 text-zinc-400 group-hover:text-lavender" />
              </button>
            </div>
          </div>

          {/* Immersive Content */}
          <div className="flex-1 p-12 overflow-y-auto custom-scrollbar">
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="max-w-3xl mx-auto space-y-12"
            >
              <div className="space-y-6">
                <h3 className="text-4xl font-bold leading-tight tracking-tighter text-white">
                  The Architecture of <span className="text-mint italic">Probability</span>
                </h3>
                <p className="text-xl text-zinc-400 leading-relaxed font-light">
                  In the quantum realm, existence is not a fixed point, but a cloud of possibilities. 
                  The wave function, denoted by <span className="font-mono text-mint">Ψ (psi)</span>, 
                  encapsulates everything we can know about a system.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-8">
                <motion.div 
                  whileHover={{ scale: 1.02 }}
                  className="glass p-8 border-mint/10 group"
                >
                  <div className="w-12 h-12 rounded-2xl bg-mint/10 flex items-center justify-center mb-6 group-hover:bg-mint/20 transition-colors">
                    <Dna className="w-6 h-6 text-mint" />
                  </div>
                  <h4 className="text-lg font-bold mb-2 text-white">Superposition</h4>
                  <p className="text-sm text-zinc-500 leading-relaxed">
                    The ability of a quantum system to be in multiple states at the same time until it is measured.
                  </p>
                </motion.div>
                <motion.div 
                  whileHover={{ scale: 1.02 }}
                  className="glass p-8 border-periwinkle/10 group"
                >
                  <div className="w-12 h-12 rounded-2xl bg-periwinkle/10 flex items-center justify-center mb-6 group-hover:bg-periwinkle/20 transition-colors">
                    <Layers className="w-6 h-6 text-periwinkle" />
                  </div>
                  <h4 className="text-lg font-bold mb-2 text-white">Entanglement</h4>
                  <p className="text-sm text-zinc-500 leading-relaxed">
                    A phenomenon where particles become interconnected, such that the state of one instantly influences the other.
                  </p>
                </motion.div>
              </div>
            </motion.div>
          </div>
        </motion.div>

        {/* AI Tutor Panel */}
        <AnimatePresence>
          {!isHyperfocus && (
            <motion.div 
              initial={{ x: 300, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: 300, opacity: 0 }}
              className="w-96 glass flex flex-col border-white/5"
            >
              <div className="p-6 border-b border-white/5 flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-periwinkle/10 flex items-center justify-center">
                  <Cpu className="w-4 h-4 text-periwinkle" />
                </div>
                <span className="font-bold text-white">NEURAL_ASSISTANT</span>
              </div>

              <div className="flex-1 p-6 overflow-y-auto space-y-6 custom-scrollbar">
                {messages.map((msg) => (
                  <motion.div 
                    key={msg.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={cn(
                      "max-w-[85%] p-4 rounded-2xl text-sm leading-relaxed",
                      msg.role === 'assistant' ? "bg-white/5 text-zinc-300 self-start" : "bg-mint text-black self-end ml-auto"
                    )}
                  >
                    {msg.content}
                  </motion.div>
                ))}
              </div>

              <div className="p-6 border-t border-white/5">
                <div className="relative">
                  <input 
                    type="text" 
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                    placeholder="Query the neural link..."
                    className="w-full bg-white/5 border border-white/10 rounded-full px-4 py-3 text-sm focus:outline-none focus:border-mint/50 transition-colors placeholder:text-zinc-600"
                  />
                  <button 
                    onClick={handleSend}
                    className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-mint flex items-center justify-center hover:bg-mint/80 transition-colors"
                  >
                    <ChevronRight className="w-4 h-4 text-black" />
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Drift Detection Overlay */}
      <AnimatePresence>
        {isDrifting && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-8"
          >
            <div className="absolute inset-0 bg-black/90 backdrop-blur-3xl" />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="relative glass max-w-2xl w-full p-12 text-center overflow-hidden"
            >
              <div className="absolute inset-0 neural-grid opacity-10" />
              <div className="relative z-10">
                <div className="w-24 h-24 rounded-full bg-mint/10 flex items-center justify-center mx-auto mb-8">
                  <Compass className="w-12 h-12 text-mint" />
                </div>
                <h2 className="text-5xl font-bold tracking-tighter mb-4 text-white">DRIFT_DETECTED</h2>
                <p className="text-xl text-zinc-400 font-light mb-12">
                  Your neural patterns indicate a deviation from the current anchor. 
                  Would you like to re-sync or initiate a tactical break?
                </p>

                <div className="grid grid-cols-2 gap-6">
                  <button 
                    onClick={() => setIsDrifting(false)}
                    className="glass p-6 group hover:bg-mint/10 transition-all duration-500"
                  >
                    <div className="w-10 h-10 rounded-xl bg-mint/10 flex items-center justify-center mx-auto mb-4 group-hover:bg-mint/20">
                      <Zap className="w-5 h-5 text-mint" />
                    </div>
                    <div className="font-bold text-white">RE-SYNC_NOW</div>
                    <div className="font-mono text-[10px] text-zinc-500 mt-1 uppercase">Return to Anchor</div>
                  </button>
                  <button 
                    onClick={() => setIsDrifting(false)}
                    className="glass p-6 group hover:bg-lavender/10 transition-all duration-500"
                  >
                    <div className="w-10 h-10 rounded-xl bg-lavender/10 flex items-center justify-center mx-auto mb-4 group-hover:bg-lavender/20">
                      <Clock className="w-5 h-5 text-lavender" />
                    </div>
                    <div className="font-bold text-white">TACTICAL_BREAK</div>
                    <div className="font-mono text-[10px] text-zinc-500 mt-1 uppercase">5m Recovery Cycle</div>
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default function App() {
  const [view, setView] = useState<View>('command');

  return (
    <div className="h-screen w-screen bg-[#050705] text-zinc-100 font-sans selection:bg-mint/30 overflow-hidden">
      {/* Global Background Elements */}
      <div className="fixed inset-0 atmosphere-bg pointer-events-none" />
      
      <VerticalRail activeView={view} setView={setView} />

      <main className="pl-20 h-full w-full relative">
        <AnimatePresence mode="wait">
          <motion.div
            key={view}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            className="h-full w-full"
          >
            {view === 'command' && <NeuralCommand />}
            {view === 'workspace' && <StudyWorkspace />}
            {view === 'neural-map' && <NeuralMap />}
            {view === 'settings' && (
              <div className="p-12">
                <h2 className="text-4xl font-bold tracking-tighter mb-8 text-white">SYSTEM_CONFIGURATION</h2>
                <div className="glass p-8 max-w-2xl">
                  <p className="font-mono text-sm text-zinc-500">Accessing kernel settings... [UNAUTHORIZED]</p>
                </div>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </main>

      {/* Global Micro-readouts */}
      <div className="fixed bottom-4 right-6 flex items-center gap-6 font-mono text-[8px] text-zinc-600 tracking-[0.3em] pointer-events-none">
        <div className="flex items-center gap-2">
          <span className="w-1 h-1 rounded-full bg-mint" />
          CORE_TEMP: 32.4°C
        </div>
        <div className="flex items-center gap-2">
          <span className="w-1 h-1 rounded-full bg-periwinkle" />
          UPTIME: 04:22:12
        </div>
      </div>
    </div>
  );
}
