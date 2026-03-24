from __future__ import annotations

import json
import logging
from typing import Optional

import boto3
from botocore.exceptions import ClientError

from app.config import get_settings

logger = logging.getLogger(__name__)


def _sample_full_text(text: str, target_chars: int = 24000) -> str:
    """
    Return a representative sample of `text` up to `target_chars` characters.
    Takes the beginning, evenly-spaced middle slices, and the end so the model
    sees content from every part of the document.
    """
    if len(text) <= target_chars:
        return text

    # Allocate: 40% beginning, 40% middle samples, 20% end
    head = int(target_chars * 0.40)
    tail = int(target_chars * 0.20)
    middle_budget = target_chars - head - tail

    # Sample 4 evenly-spaced windows from the middle section
    middle_start = head
    middle_end = len(text) - tail
    middle_len = middle_end - middle_start
    num_windows = 4
    window_size = middle_budget // num_windows
    step = middle_len // (num_windows + 1)

    middle_parts = []
    for i in range(1, num_windows + 1):
        pos = middle_start + step * i
        snippet = text[pos: pos + window_size]
        middle_parts.append(snippet)

    return (
        text[:head]
        + "\n\n[...]\n\n"
        + "\n\n[...]\n\n".join(middle_parts)
        + "\n\n[...]\n\n"
        + text[-tail:]
    )


_DEMO_REFORMAT = """## 🎯 What You're Mastering
This section covers the Laws of Thermodynamics — the principles governing every energy transformation in the universe, from car engines to the human body.

## 📖 The Core Ideas

**First Law — Energy is always conserved:**
Think of your phone battery. Charging converts electrical energy to chemical energy. Using it converts chemical energy to heat and light. The total never disappears — it only changes form.

> **ΔU = Q − W** → Change in internal energy = Heat added to system − Work done BY the system

**Second Law — Disorder always increases:**
Drop an ice cube into warm water. The ice melts, the water cools slightly, and the temperature evens out. This process never runs backwards spontaneously — that directionality is entropy.

> **ΔS ≥ Q / T** → Entropy change is always ≥ heat transferred divided by absolute temperature

## 💡 Real-World Analogy
A car engine is a heat engine: it absorbs heat from burning fuel (hot reservoir), converts *some* of it to mechanical work (moves the car), and dumps the rest as exhaust (cold reservoir). The Second Law guarantees no engine can convert 100% of heat to work — the Carnot limit sets the ceiling.

## 🔗 The Big Picture
These two laws explain why perpetual motion machines are physically impossible, why the universe trends toward disorder, and why all real processes are irreversible. They define the hard limits of every energy technology ever built.

## 🧠 Key Takeaways
📌 **First Law**: Energy is conserved — ΔU = Q − W is the master equation
📌 **Second Law**: Entropy of an isolated system never decreases — disorder always wins
📌 Carnot efficiency = 1 − T_cold / T_hot — the theoretical maximum for any heat engine
📌 Always use **Kelvin** (not Celsius) in thermodynamic calculations
📌 Heat flows spontaneously from **hot → cold**, never the reverse

## ▶ Core Equations
▶ **ΔU = Q − W** — First Law: internal energy change equals heat in minus work out
▶ **η_Carnot = 1 − T_cold / T_hot** — Maximum efficiency of any heat engine (temperatures in Kelvin)
▶ **ΔS = Q_rev / T** — Entropy change for a reversible process at temperature T

```mermaid
flowchart TD
    A[Heat input Q from hot reservoir] --> B[Heat Engine]
    B --> C[Useful work W output]
    B --> D[Waste heat to cold reservoir]
    E["Carnot limit: η = 1 − T_cold/T_hot"] -. upper bound .-> B
```
"""

_DEMO_CHEATSHEET = """## 📋 Thermodynamics — Study Reference

## 🔑 Key Terms
- **System**: The defined region being studied (e.g., gas inside a piston)
- **Internal Energy (U)**: Total kinetic + potential energy of all particles in the system
- **Entropy (S)**: Measure of disorder — the number of microstates corresponding to a macrostate
- **Heat (Q)**: Energy transferred due to a temperature difference (positive = into the system)
- **Work (W)**: Energy transferred by mechanical means (positive = done BY the system)
- **Adiabatic**: No heat exchange — Q = 0 (e.g., rapid compression)
- **Isothermal**: Constant temperature — ΔT = 0 (e.g., slow expansion in contact with a reservoir)
- **Isobaric**: Constant pressure — ΔP = 0 (e.g., heating a gas in an open container)
- **Isochoric**: Constant volume — ΔV = 0, so W = 0 (e.g., heating a rigid container)

## 📐 Essential Formulas
| Formula | What It Means |
|---|---|
| ΔU = Q − W | First Law — energy conservation |
| ΔS = Q_rev / T | Entropy change for a reversible process |
| η = 1 − T_cold / T_hot | Carnot (maximum possible) efficiency |
| Q/t = kA(ΔT/Δx) | Fourier's Law — conductive heat transfer rate |

## ⚡ Quick-Fire Facts
- Heat flows spontaneously **hot → cold**, never the reverse
- 0 K = −273.15 °C — absolute zero, the minimum possible temperature
- A Carnot engine between 300 K and 600 K has maximum efficiency = **50%**
- Entropy of the universe is always increasing — this defines the **arrow of time**
- In an adiabatic compression: no heat escapes, so all work input becomes internal energy → temperature rises
- For an ideal gas isothermal process: ΔU = 0, so Q = W (all heat in becomes work out)

## 🧠 Common Mistakes
- Using Celsius instead of Kelvin in efficiency or entropy formulas (always convert to K)
- Confusing heat Q (energy transfer) with temperature T (a state property)
- Forgetting the sign convention: W is work done **by** the system (expansion is positive)
- Assuming an irreversible real process can reach Carnot efficiency
- Mixing up isothermal (ΔT = 0) and adiabatic (Q = 0) — they are different constraints
"""

_DEMO_QUIZ = [
    {
        "question": "What does the First Law of Thermodynamics state?",
        "options": [
            "A) Energy cannot be created or destroyed, only converted between forms",
            "B) Entropy of an isolated system always increases over time",
            "C) Heat spontaneously flows from cold objects to hot objects",
            "D) The efficiency of any heat engine equals 1 − T_cold / T_hot",
        ],
        "correct_answer": "A",
        "explanation": "The First Law is conservation of energy: ΔU = Q − W. Energy changes form but is never created or destroyed. Option B is the Second Law; option D is the Carnot efficiency formula.",
        "difficulty": "recall",
    },
    {
        "question": "In the equation ΔU = Q − W, what does the term W represent?",
        "options": [
            "A) The weight of the thermodynamic system",
            "B) Work done BY the system on its surroundings",
            "C) The wavelength of thermal radiation emitted",
            "D) Work done ON the system by its surroundings",
        ],
        "correct_answer": "B",
        "explanation": "W is the work done BY the system. When a gas expands and pushes a piston, it does positive work on the surroundings, decreasing its internal energy. Work done ON the system would be −W in this convention.",
        "difficulty": "recall",
    },
    {
        "question": "A Carnot engine operates between a hot reservoir at 600 K and a cold reservoir at 300 K. What is its maximum theoretical efficiency?",
        "options": ["A) 25%", "B) 33%", "C) 50%", "D) 100%"],
        "correct_answer": "C",
        "explanation": "Carnot efficiency η = 1 − T_cold / T_hot = 1 − 300/600 = 0.50 = 50%. Both temperatures must be in Kelvin. No real engine can exceed this limit — the Second Law forbids it.",
        "difficulty": "application",
    },
    {
        "question": "Which heat transfer mechanism can operate through a complete vacuum?",
        "options": ["A) Conduction", "B) Convection", "C) Radiation", "D) Advection"],
        "correct_answer": "C",
        "explanation": "Radiation transfers energy via electromagnetic waves and requires no medium — this is how the Sun's energy reaches Earth across the vacuum of space. Conduction and convection both require a material medium.",
        "difficulty": "recall",
    },
    {
        "question": "What defines an adiabatic thermodynamic process?",
        "options": [
            "A) Temperature remains constant throughout",
            "B) Pressure remains constant throughout",
            "C) No heat is exchanged with the surroundings — Q = 0",
            "D) Volume remains constant, so no work is done",
        ],
        "correct_answer": "C",
        "explanation": "Adiabatic means Q = 0. No heat crosses the system boundary. Consequently ΔU = −W: any work done by the system comes entirely from its internal energy, which changes the temperature.",
        "difficulty": "recall",
    },
]

_DEMO_REANCHOR = {
    "question": "According to the Second Law of Thermodynamics, what happens to the total entropy of an isolated system over time?",
    "options": [
        "A) It always increases — disorder grows in every spontaneous process",
        "B) It remains perfectly constant — energy is conserved",
        "C) It decreases as the system moves toward equilibrium",
        "D) It oscillates — entropy increases then decreases cyclically",
    ],
    "correct_answer": "A",
    "explanation": "The Second Law states that the entropy of an isolated system never decreases. Spontaneous processes always increase total entropy, which is why heat flows from hot to cold and not the reverse.",
}

_DEMO_SESSION_PLAN = {
    "sprints": [
        {
            "title": "Sprint 1: First Law & Internal Energy",
            "duration_minutes": 15,
            "focus": "Master ΔU = Q − W and the concept of internal energy with worked examples",
            "material_hint": "Begin with the First Law definition and the energy conservation statement",
        },
        {
            "title": "Sprint 2: Second Law & Entropy",
            "duration_minutes": 15,
            "focus": "Understand entropy, disorder, and why spontaneous processes are irreversible",
            "material_hint": "Focus on the entropy definition ΔS = Q_rev / T and the arrow of time",
        },
        {
            "title": "Sprint 3: Heat Transfer Mechanisms",
            "duration_minutes": 15,
            "focus": "Distinguish conduction, convection, and radiation with their governing equations",
            "material_hint": "Study Fourier's law, Newton's law of cooling, and Stefan-Boltzmann law",
        },
        {
            "title": "Sprint 4: Carnot Cycle & Heat Engine Efficiency",
            "duration_minutes": 15,
            "focus": "Apply the Carnot efficiency formula and understand why no real engine can exceed it",
            "material_hint": "Work through the Carnot cycle diagram and the efficiency derivation",
        },
        {
            "title": "Sprint 5: Thermodynamic Processes",
            "duration_minutes": 15,
            "focus": "Identify isothermal, adiabatic, isobaric, and isochoric processes and their constraints",
            "material_hint": "Compare each process type using the P-V diagram",
        },
        {
            "title": "Sprint 6: Review & Self-Test",
            "duration_minutes": 15,
            "focus": "Connect all concepts, solve practice problems, identify remaining gaps",
            "material_hint": "Use the cheatsheet formulas as a checklist — can you derive each one?",
        },
    ],
    "total_sprints": 6,
}

_DEMO_TUTOR_RESPONSES = [
    "Great question! The key distinction is the sign convention for W. In the physics convention used here (ΔU = Q − W), W is work done BY the system. When a gas expands and pushes a piston outward, it does positive work, which reduces its internal energy. If you see ΔU = Q + W in other textbooks, W there means work done ON the system — opposite sign, same physics.",
    "You're thinking about it correctly! Entropy isn't just a formula — it's a measure of how many microscopic arrangements are possible for a given macroscopic state. A cold, ordered crystal has very few arrangements (low entropy). A hot gas has an enormous number of possible particle positions and velocities (high entropy). The Second Law says the universe always moves toward states with more arrangements available.",
    "The Carnot efficiency η = 1 − T_cold/T_hot is the absolute ceiling for any heat engine. The key insight is that you can never extract ALL the heat as work — some must always be dumped to the cold reservoir. The only way to reach 100% efficiency would be T_cold = 0 K (absolute zero), which is impossible to achieve in practice (Third Law of Thermodynamics).",
    "Don't worry — isothermal and adiabatic trip everyone up. Here's the anchor: **iso**thermal = same **T**emperature (ΔT = 0, so for an ideal gas ΔU = 0, meaning all heat in becomes work out). **Adi**abatic = **no heat** crosses the boundary (Q = 0, so all work changes internal energy, which changes temperature). They're opposite constraints.",
    "For the entropy calculation: always check whether the process is reversible or irreversible. For a reversible process, ΔS = Q_rev / T. For an irreversible process (which all real processes are), ΔS > Q / T — the system generates extra entropy internally. The total entropy of the universe (system + surroundings) still increases.",
]

_DEMO_REEXPLAIN = """Let me approach this from a completely different angle.

**Think of entropy like a messy room:**

Imagine your room has one specific "tidy" arrangement — everything in exactly the right place. But there are *millions* of "messy" arrangements — clothes on the floor, books scattered, cups everywhere.

If you randomly rearrange things (close your eyes and move stuff around), you're overwhelmingly likely to end up in *some* messy state rather than the one tidy state.

That's entropy in physics:
1. **Low entropy** = very few possible arrangements (ice crystal, ordered)
2. **High entropy** = enormous number of possible arrangements (steam, disordered)
3. **Why entropy increases** = there are simply far more disordered states than ordered ones — random processes statistically end up there

**Applied to heat flow:**
When you put a hot object next to a cold one, the fast-moving (hot) molecules and slow-moving (cold) molecules mix. The mixed state has vastly more possible arrangements than "all fast ones here, all slow ones there." So mixing is overwhelmingly probable.

**The one thing to remember: Entropy increases not because of any force — but because disordered states vastly outnumber ordered ones.**
"""

_DEMO_RETENTION = {
    "overall_retention": 72.0,
    "strong_areas": ["First Law (ΔU = Q − W)", "Heat transfer mechanisms", "Carnot cycle concept"],
    "weak_areas": ["Entropy calculations for irreversible processes", "Distinguishing isothermal vs adiabatic"],
    "summary": "Solid grasp of energy conservation and heat engine principles. Entropy and process classification need consolidation.",
    "recommendation": "Practice computing entropy changes for both reversible and irreversible processes. Draw P-V diagrams for each process type to build visual intuition before the next session.",
}

_DEMO_PROFILE_ANALYSIS = {
    "best_focus_time_of_day": "evening",
    "preferred_content_format": "text",
    "weak_topics": ["entropy and irreversibility", "thermodynamic process classification", "Carnot efficiency calculations"],
    "insights": "Strong recall on definitions and First Law mechanics. Second Law and entropy concepts show the most variability — these are the highest-leverage areas for focused review before an exam.",
}


class BedrockService:
    def __init__(self):
        settings = get_settings()
        self._settings = settings

        # Demo mode: explicit flag OR no AWS credentials configured
        self._demo: bool = settings.demo_mode or not (
            settings.aws_access_key_id and settings.aws_secret_access_key
        )

        if self._demo:
            logger.info("BedrockService running in DEMO MODE — no AWS calls will be made")
            self._client = None
            return

        kwargs = {
            "region_name": settings.aws_region,
            "service_name": "bedrock-runtime",
        }
        kwargs["aws_access_key_id"] = settings.aws_access_key_id
        kwargs["aws_secret_access_key"] = settings.aws_secret_access_key

        self._client = boto3.client(**kwargs)

    def _resolve_model_id(self, model: str) -> str:
        if self._demo:
            return "demo"
        mapping = {
            "pro": self._settings.bedrock_model_pro,
            "lite": self._settings.bedrock_model_lite,
            "micro": self._settings.bedrock_model_micro,
        }
        return mapping.get(model, self._settings.bedrock_model_lite)

    async def invoke(
        self,
        prompt: str,
        model: str = "lite",
        system: Optional[str] = None,
        max_tokens: int = 1024,
    ) -> str:
        if self._demo:
            return "[Demo mode] AI response placeholder. Configure AWS credentials to enable full AI features."
        model_id = self._resolve_model_id(model)

        messages = [{"role": "user", "content": [{"text": prompt}]}]
        inference_config = {"maxTokens": max_tokens, "temperature": 0.7}

        kwargs: dict = {
            "modelId": model_id,
            "messages": messages,
            "inferenceConfig": inference_config,
        }
        if system:
            kwargs["system"] = [{"text": system}]

        try:
            import asyncio
            loop = asyncio.get_event_loop()
            response = await loop.run_in_executor(
                None,
                lambda: self._client.converse(**kwargs),
            )
            return response["output"]["message"]["content"][0]["text"]
        except ClientError as e:
            logger.error(f"Bedrock ClientError: {e}")
            return f"[AI temporarily unavailable: {str(e)[:100]}]"
        except Exception as e:
            logger.error(f"Bedrock invoke error: {e}")
            return f"[AI error: {str(e)[:100]}]"

    async def invoke_with_image(
        self,
        prompt: str,
        image_bytes: bytes,
        image_format: str = "jpeg",
        model: str = "lite",
        system: Optional[str] = None,
        max_tokens: int = 2048,
    ) -> str:
        """Send a text + image message to Claude via Bedrock (multimodal)."""
        if self._demo:
            return "Page content extracted in demo mode. Full text extraction requires AWS credentials."
        model_id = self._resolve_model_id(model)

        messages = [
            {
                "role": "user",
                "content": [
                    {
                        "image": {
                            "format": image_format,
                            "source": {"bytes": image_bytes},
                        }
                    },
                    {"text": prompt},
                ],
            }
        ]
        inference_config = {"maxTokens": max_tokens, "temperature": 0.3}
        kwargs: dict = {
            "modelId": model_id,
            "messages": messages,
            "inferenceConfig": inference_config,
        }
        if system:
            kwargs["system"] = [{"text": system}]

        try:
            import asyncio
            loop = asyncio.get_event_loop()
            response = await loop.run_in_executor(
                None,
                lambda: self._client.converse(**kwargs),
            )
            return response["output"]["message"]["content"][0]["text"]
        except Exception as e:
            logger.error(f"Bedrock vision invoke error: {e}")
            return ""

    async def analyze_page_with_vision(self, image_bytes: bytes, page_num: int) -> str:
        """
        Use Claude vision to extract full understanding from a PDF/slide page image.
        Returns a rich text description including diagrams, tables, charts, formulas.
        """
        prompt = (
            f"This is page {page_num + 1} of a study document. "
            "Extract ALL information from this page completely and accurately:\n\n"
            "1. All text, headings, and paragraphs (exact wording)\n"
            "2. All diagrams, flowcharts, and process flows — reproduce as a Mermaid diagram in a ```mermaid fenced block\n"
            "3. All tables — reproduce them in markdown table format\n"
            "4. All mathematical formulas and equations — write them clearly\n"
            "5. All charts and graphs — describe axes, data trends, and key values\n"
            "6. All images — describe what they show and their educational relevance\n\n"
            "Format your response as clean, structured text that preserves all knowledge "
            "from the page. Do not omit anything — even decorative elements may provide context."
        )
        system = (
            "You are an expert academic content extractor. "
            "Your job is to convert visual study material into complete, accurate text "
            "that preserves 100% of the educational content. "
            "For diagrams and flowcharts, use Mermaid syntax in a ```mermaid fenced code block. "
            "For tables, use markdown table syntax. "
            "Never omit information — be exhaustive."
        )
        return await self.invoke_with_image(
            prompt=prompt,
            image_bytes=image_bytes,
            image_format="jpeg",
            model="lite",
            system=system,
            max_tokens=3000,
        )

    async def reformat_content(self, text: str, format_hint: str = "adhd") -> str:
        """
        Transform raw study text into a deeply explanatory, visually rich ADHD lesson.
        Uses Nova Pro for maximum quality. Teaches, explains, and builds intuition.
        """
        if self._demo:
            return _DEMO_REFORMAT
        prompt = (
            "You are an expert tutor. Transform the raw study content below into a complete, "
            "deeply explanatory lesson for a student with ADHD.\n\n"
            "YOUR JOB IS TO TEACH — not just reformat. That means:\n"
            "- Explain WHY things work, not just WHAT they are\n"
            "- Give concrete real-world examples for abstract ideas\n"
            "- Build intuition with analogies before introducing technical terms\n"
            "- Fill in context the raw text assumes the student already knows\n"
            "- Make every concept feel approachable and understandable\n\n"
            "REQUIRED OUTPUT STRUCTURE — use exactly these section headers:\n\n"
            "## 🎯 What You'll Learn\n"
            "One crisp sentence: what this section teaches and why it matters.\n\n"
            "## 📖 The Concept\n"
            "Explain the core idea step by step. Start with a simple plain-language explanation, "
            "then introduce the technical/formal version. Bold **key terms** on first use. "
            "Short paragraphs (2-3 sentences max). Leave blank lines between ideas.\n\n"
            "## 💡 Example\n"
            "Give 1-2 concrete, relatable examples. Use a real-world analogy if the concept is abstract. "
            "Show don't just tell.\n\n"
            "## 🔗 The Big Picture\n"
            "2-3 sentences: how this connects to other concepts, why it matters, or where it appears in real life.\n\n"
            "## 🧠 Key Takeaways\n"
            "📌 3-5 bullet points — the most important things to remember.\n\n"
            "OPTIONAL SECTIONS — include only if genuinely relevant:\n"
            "## ▶ Formulas\n"
            "Format: ▶ F = ma  → Force equals mass times acceleration\n"
            "(explain every symbol on the same line)\n\n"
            "VISUAL AIDS — generate these where they genuinely add understanding:\n"
            "- Comparisons → markdown table: | Feature | Option A | Option B |\n"
            "- Processes / flows / pipelines → Mermaid flowchart (use ```mermaid ... ``` fenced block)\n"
            "- Sequences / timelines → Mermaid sequenceDiagram\n"
            "- Hierarchies / trees → Mermaid graph TD\n"
            "- State machines → Mermaid stateDiagram-v2\n"
            "- Class relationships → Mermaid classDiagram\n"
            "NEVER use ASCII art like [Box] → [Box]. Always use Mermaid for any diagram.\n\n"
            "TONE: Clear, direct, conversational. Like a brilliant friend explaining it. "
            "Never condescending. Always encouraging.\n\n"
            f"Raw content to teach:\n{text[:8000]}\n\n"
            "Return only the lesson content in markdown. Be thorough and genuinely educational."
        )
        system = (
            "You are an exceptional tutor who specializes in making complex content crystal clear "
            "for students with ADHD. You build intuition, give examples, use visuals, and create "
            "true deep understanding — never just surface-level bullet points. "
            "Your explanations are warm, clear, and memorable. Return clean markdown only."
        )
        return await self.invoke(prompt=prompt, model="pro", system=system, max_tokens=4096)

    async def generate_quiz_questions(self, content: str, num_questions: int = 5) -> list[dict]:
        """
        Generate MCQ questions with 3 difficulty tiers and thorough explanations.
        Always returns exactly num_questions questions.
        """
        if self._demo:
            return _DEMO_QUIZ[:num_questions]
        prompt = (
            f"Generate exactly {num_questions} multiple-choice comprehension questions "
            f"based on the following study content.\n\n"
            f"DIFFICULTY DISTRIBUTION:\n"
            f"- Questions 1-2: RECALL (direct facts from the text)\n"
            f"- Questions 3-4: COMPREHENSION (understanding concepts, why/how)\n"
            f"- Question 5: APPLICATION (applying knowledge to a new scenario)\n\n"
            f"REQUIREMENTS for each question:\n"
            f"- 4 options: A) B) C) D) — only one correct\n"
            f"- Options must be plausible, not obviously wrong\n"
            f"- correct_answer: just the letter (A, B, C, or D)\n"
            f"- explanation: 2-3 sentences explaining WHY the answer is correct "
            f"AND why the most tempting wrong answer is incorrect\n\n"
            f"Return a JSON array:\n"
            f'[{{"question": "...", "options": ["A) ...", "B) ...", "C) ...", "D) ..."], '
            f'"correct_answer": "A", "explanation": "...", "difficulty": "recall|comprehension|application"}}]\n\n'
            f"Content:\n{content[:4000]}\n\n"
            f"Return only the JSON array, no other text."
        )
        system = "You are an expert quiz writer. Always return valid JSON arrays only."
        response = await self.invoke(prompt=prompt, model="lite", system=system, max_tokens=3000)

        try:
            start = response.find("[")
            end = response.rfind("]") + 1
            if start != -1 and end > start:
                questions = json.loads(response[start:end])
                if isinstance(questions, list) and len(questions) > 0:
                    return questions
        except Exception as e:
            logger.error(f"Failed to parse quiz questions: {e}, response: {response[:200]}")

        # Fallback: generic questions
        return [
            {
                "question": f"What is the main concept discussed in this content? (Question {i+1})",
                "options": ["A) The first main idea", "B) A secondary detail", "C) An unrelated concept", "D) A supporting example"],
                "correct_answer": "A",
                "explanation": "Review the content for the main concept and supporting details.",
                "difficulty": "recall" if i < 2 else "comprehension" if i < 4 else "application",
            }
            for i in range(num_questions)
        ]

    async def generate_reanchor_question(self, content: str) -> dict:
        if self._demo:
            return _DEMO_REANCHOR
        prompt = (
            "Generate a single quick re-focus MCQ question to help a distracted student "
            "re-engage with their study material. The question should be based on a specific, "
            "memorable fact or concept from the content.\n\n"
            "Return JSON:\n"
            '{"question": "...", "options": ["A) ...", "B) ...", "C) ...", "D) ..."], '
            '"correct_answer": "A", "explanation": "..."}\n\n'
            f"Content:\n{content[:2000]}\n\n"
            "Return only JSON, no other text."
        )
        system = "You are a study focus assistant. Return valid JSON only."
        response = await self.invoke(prompt=prompt, model="micro", system=system, max_tokens=512)

        try:
            start = response.find("{")
            end = response.rfind("}") + 1
            if start != -1 and end > start:
                return json.loads(response[start:end])
        except Exception as e:
            logger.error(f"Failed to parse reanchor question: {e}")

        return {
            "question": "What was the last key concept you remember from the material?",
            "options": ["A) Focus on main idea", "B) Review the section", "C) Take a break", "D) Ask for help"],
            "correct_answer": "A",
            "explanation": "Re-reading the last section will help you refocus.",
        }

    async def generate_cheatsheet(self, material_title: str, full_text: str) -> str:
        """
        Generate a concise, structured cheatsheet/résumé for a study material.
        Samples the full document so no section is missed.
        """
        if self._demo:
            return _DEMO_CHEATSHEET
        # Build a representative sample: beginning + evenly-spaced middle sections + end
        content = _sample_full_text(full_text, target_chars=24000)

        prompt = (
            f"Create a comprehensive cheatsheet and résumé for the following study material.\n"
            f"Material title: {material_title}\n\n"
            "The cheatsheet must cover the ENTIRE document, not just the introduction. "
            "Include ALL concepts, terms, and topics from start to finish.\n\n"
            "## 📋 Overview\n"
            "2-3 sentences describing what this material covers and why it matters.\n\n"
            "## 🔑 Key Terms\n"
            "- **Term**: Definition (one clear sentence each)\n"
            "List every important term and concept from the entire document.\n\n"
            "## 📚 Core Concepts\n"
            "Numbered list of ALL main ideas with brief explanations (2-3 sentences each). "
            "Cover concepts from every section, not just the beginning.\n\n"
            "## ▶ Formulas & Rules\n"
            "List any mathematical formulas, laws, rules, or principles with their meaning.\n"
            "(Skip this section if none apply)\n\n"
            "## 🔄 Processes & Steps\n"
            "Any sequential processes described as numbered steps.\n"
            "(Skip this section if none apply)\n\n"
            "## ⚡ Quick-Fire Facts\n"
            "10-15 bullet points of must-know facts drawn from the whole document.\n\n"
            "## 🧠 Common Mistakes to Avoid\n"
            "3-5 bullet points on typical misconceptions or errors.\n\n"
            f"Study material (full document):\n{content}\n\n"
            "Return the cheatsheet in clean markdown. Be thorough — cover the complete document."
        )
        system = (
            "You are an expert academic tutor creating exam study materials. "
            "Create thorough, accurate cheatsheets that cover ALL content from start to end. "
            "Use markdown formatting. Never omit important concepts. "
            "The document sample you receive represents the full content — treat it as complete."
        )
        return await self.invoke(prompt=prompt, model="pro", system=system, max_tokens=4096)

    async def generate_session_plan(
        self,
        goal: str,
        materials_summary: str,
        available_minutes: int = 90,
    ) -> dict:
        if self._demo:
            num_sprints = max(1, available_minutes // 15)
            plan = dict(_DEMO_SESSION_PLAN)
            plan["sprints"] = _DEMO_SESSION_PLAN["sprints"][:num_sprints]
            plan["total_sprints"] = len(plan["sprints"])
            return plan
        num_sprints = max(1, available_minutes // 15)
        prompt = (
            f"Create a structured study session plan for a student with ADHD.\n"
            f"Goal: {goal}\n"
            f"Available time: {available_minutes} minutes\n"
            f"Materials overview (ALL sections listed):\n{materials_summary[:6000]}\n\n"
            f"IMPORTANT: Distribute the {num_sprints} sprints across ALL listed sections/topics, "
            f"not just the first one. Each sprint should target a distinct section of the material.\n\n"
            f"Create {num_sprints} sprints of ~15 minutes each.\n"
            f"Return JSON with this structure:\n"
            f'{{"sprints": [{{"title": "...", "duration_minutes": 15, '
            f'"focus": "...", "material_hint": "..."}}], "total_sprints": {num_sprints}}}\n\n'
            f"Return only JSON."
        )
        system = (
            "You are an ADHD study coach. Create focused, achievable study plans. "
            "Each sprint should have a clear, specific focus. Return valid JSON only."
        )
        response = await self.invoke(prompt=prompt, model="lite", system=system, max_tokens=2048)

        try:
            start = response.find("{")
            end = response.rfind("}") + 1
            if start != -1 and end > start:
                plan = json.loads(response[start:end])
                if "sprints" in plan:
                    return plan
        except Exception as e:
            logger.error(f"Failed to parse session plan: {e}")

        sprints = [
            {
                "title": f"Sprint {i + 1}: Study Block",
                "duration_minutes": 15,
                "focus": goal,
                "material_hint": "Review available materials",
            }
            for i in range(num_sprints)
        ]
        return {"sprints": sprints, "total_sprints": num_sprints}

    def test_bedrock_connection(self) -> bool:
        if self._demo:
            return True  # demo mode always "connected"
        try:
            self._client.converse(
                modelId=self._settings.bedrock_model_micro,
                messages=[{"role": "user", "content": [{"text": "hi"}]}],
                inferenceConfig={"maxTokens": 5},
            )
            return True
        except Exception:
            return False

    async def generate_ai_tutor_response(
        self,
        question: str,
        current_content: str,
        conversation_history: list,
    ) -> str:
        if self._demo:
            import hashlib
            idx = int(hashlib.md5(question.encode()).hexdigest(), 16) % len(_DEMO_TUTOR_RESPONSES)
            return _DEMO_TUTOR_RESPONSES[idx]
        history_text = ""
        if conversation_history:
            lines = []
            for turn in conversation_history[-6:]:
                role = turn.get("role", "user").capitalize()
                lines.append(f"{role}: {turn.get('text', '')}")
            history_text = "\n".join(lines) + "\n\n"

        content_block = (
            f"Study material context:\n{current_content[:2500]}\n\n"
            if current_content
            else ""
        )

        prompt = (
            f"{content_block}"
            f"{history_text}"
            f"Student: {question}"
        )
        system = (
            "You are an ADHD study tutor embedded in a learning session. "
            "Answer concisely (3-5 sentences max). Use bullet points for multi-part answers. "
            "Always ground your answer in the study material provided. Be encouraging."
        )
        return await self.invoke(prompt=prompt, model="lite", system=system, max_tokens=512)

    async def reformat_content_for_adhd(self, text: str) -> str:
        return await self.reformat_content(text, format_hint="adhd")

    async def generate_retention_snapshot(self, session_results: list) -> dict:
        if self._demo:
            scores = [r.get("score", 0) for r in session_results if "score" in r]
            avg = round(sum(scores) / len(scores), 1) if scores else _DEMO_RETENTION["overall_retention"]
            result = dict(_DEMO_RETENTION)
            result["overall_retention"] = avg
            return result
        prompt = (
            f"Analyze these study sprint results and generate a retention snapshot.\n"
            f"Results: {json.dumps(session_results[:20])}\n\n"
            f"Return JSON with this exact structure:\n"
            f'{{"overall_retention": <float 0-100>, "strong_areas": ["..."], '
            f'"weak_areas": ["..."], "summary": "one sentence", '
            f'"recommendation": "next step"}}\n'
            f"Return only JSON."
        )
        system = "You are a learning analytics assistant. Return valid JSON only."
        response = await self.invoke(prompt=prompt, model="micro", system=system, max_tokens=512)
        try:
            start = response.find("{")
            end = response.rfind("}") + 1
            if start != -1 and end > start:
                return json.loads(response[start:end])
        except Exception as e:
            logger.error(f"Failed to parse retention snapshot: {e}")

        scores = [r.get("score", 0) for r in session_results if "score" in r]
        avg = sum(scores) / len(scores) if scores else 0.0
        return {
            "overall_retention": round(avg, 1),
            "strong_areas": [],
            "weak_areas": [],
            "summary": f"Session completed with {len(session_results)} sprint(s).",
            "recommendation": "Review weak areas before the next session.",
        }

    async def analyze_learning_profile(
        self, session_history: list, current_profile: dict
    ) -> dict:
        if self._demo:
            return _DEMO_PROFILE_ANALYSIS
        prompt = (
            f"Analyze this student's learning history and identify patterns.\n"
            f"Session history (last 10): {json.dumps(session_history[:10])}\n"
            f"Current profile: {json.dumps(current_profile)}\n\n"
            f"Return JSON with fields to update:\n"
            f'{{"best_focus_time_of_day": "morning|afternoon|evening|night", '
            f'"preferred_content_format": "pdf|text|slides|video", '
            f'"weak_topics": ["topic1", "topic2"], '
            f'"insights": "one sentence insight"}}\n'
            f"Return only JSON."
        )
        system = "You are a learning profile analyst. Return valid JSON only."
        response = await self.invoke(prompt=prompt, model="lite", system=system, max_tokens=512)
        try:
            start = response.find("{")
            end = response.rfind("}") + 1
            if start != -1 and end > start:
                return json.loads(response[start:end])
        except Exception as e:
            logger.error(f"Failed to parse learning profile analysis: {e}")

        return {
            "best_focus_time_of_day": current_profile.get("best_focus_time_of_day"),
            "preferred_content_format": current_profile.get("preferred_content_format"),
            "weak_topics": current_profile.get("weak_topics", []),
            "insights": "Not enough data to generate insights yet.",
        }

    async def reexplain_chunk(self, text: str) -> str:
        """Re-explain a content chunk from scratch using a different approach for a confused student."""
        if self._demo:
            return _DEMO_REEXPLAIN
        prompt = (
            "A student just said 'I'm lost' after reading the content below. "
            "Re-explain it using a COMPLETELY DIFFERENT approach:\n\n"
            "1. Open with a single concrete real-world analogy — make it feel familiar\n"
            "2. Break the core idea into 3-4 bite-sized numbered steps\n"
            "3. Use short sentences (max 15 words each). No jargon without immediate plain-English explanation\n"
            "4. End with one bolded sentence: **The one thing to remember: ...**\n\n"
            "Keep it under 250 words. Warm, reassuring tone — this student just needs a fresh angle.\n\n"
            f"Original content:\n{text[:2500]}\n\n"
            "Return only the re-explanation in clean markdown."
        )
        system = (
            "You are a patient, warm ADHD tutor. When a student is confused, you find the "
            "simplest possible path to understanding — concrete, brief, and encouraging. "
            "Never repeat the same explanation in different words. Find a genuinely new angle."
        )
        return await self.invoke(prompt=prompt, model="lite", system=system, max_tokens=800)

    async def score_answer(self, question: dict, user_answer: str) -> dict:
        correct = question.get("correct_answer", "A")
        user_letter = user_answer.strip().upper()[:1] if user_answer else ""
        is_correct = user_letter == correct.upper()

        if not is_correct:
            prompt = (
                f"Question: {question.get('question', '')}\n"
                f"Options: {question.get('options', [])}\n"
                f"Correct answer: {correct}\n"
                f"Student answered: {user_answer}\n\n"
                f"Provide a brief, encouraging explanation of why the correct answer is right "
                f"and what the student missed. Keep it under 2 sentences."
            )
            explanation = await self.invoke(prompt=prompt, model="micro", max_tokens=256)
        else:
            explanation = question.get("explanation", "Correct! Great job.")

        return {
            "correct": is_correct,
            "explanation": explanation,
            "correct_answer": correct,
        }
