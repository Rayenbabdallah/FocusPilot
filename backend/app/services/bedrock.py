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


_DEMO_REFORMAT = """## 🎯 What You'll Learn
This section introduces the key concepts in your study material and why they matter for real-world applications.

## 📖 The Concept
Think of it like a recipe — before you can cook, you need to understand each ingredient.

**Core idea**: Every complex system is built from simpler, well-defined building blocks. Understanding those blocks lets you reason about anything.

The formal version introduces notation and definitions that make communication precise.

## 💡 Example
Imagine sorting a deck of cards. You could:
1. Pick up all cards and arrange them at once (unrealistic)
2. Pick one card at a time and insert it in the right place — this is **insertion sort**, and it mirrors how humans naturally sort

## 🔗 The Big Picture
These concepts appear everywhere — from database indexing to how your GPS finds the fastest route. Mastering them unlocks patterns you'll recognize across all of computer science.

## 🧠 Key Takeaways
📌 Break complex problems into smaller, solved sub-problems
📌 Understand the *why* behind each concept, not just the *what*
📌 Real-world performance depends on choosing the right approach for the data
📌 Practice is the only way to build intuition — reading is not enough
📌 When stuck, draw a picture — visual models make abstract ideas concrete

## ▶ Formulas
▶ T(n) = O(n log n) → Time complexity grows as n-log-n — efficient for large inputs
▶ S(n) = O(n) → Space complexity grows linearly with input size

```mermaid
flowchart TD
    A[Start with raw content] --> B[Identify core concept]
    B --> C[Find a real-world analogy]
    C --> D[Build intuition step by step]
    D --> E[Connect to bigger picture]
    E --> F[Consolidate with key takeaways]
```
"""

_DEMO_CHEATSHEET = """## 📋 Overview
This material covers the fundamental concepts that form the backbone of the subject. Understanding these will unlock your ability to reason about advanced topics with confidence.

## 🔑 Key Terms
- **Algorithm**: A step-by-step procedure for solving a problem in finite time
- **Data Structure**: A way of organizing data to enable efficient operations
- **Complexity**: How resource usage (time/memory) grows with input size
- **Recursion**: A function that calls itself with a smaller version of the problem
- **Abstraction**: Hiding implementation details behind a clean interface

## 📚 Core Concepts
1. **Divide and Conquer** — Split a problem into smaller sub-problems, solve each, combine results. Used in merge sort, quicksort, binary search.
2. **Dynamic Programming** — Cache solutions to overlapping sub-problems to avoid redundant computation. Memoization vs tabulation.
3. **Graph Traversal** — BFS explores layer by layer (shortest path); DFS explores as deep as possible (cycle detection, topological sort).
4. **Greedy Algorithms** — Make the locally optimal choice at each step. Works when local choices lead to global optima (Dijkstra, Huffman coding).
5. **Amortized Analysis** — Some operations are expensive but rare; average cost over a sequence is low (e.g., dynamic array resize).

## ▶ Formulas & Rules
- O(1) < O(log n) < O(n) < O(n log n) < O(n²) < O(2ⁿ) — complexity hierarchy
- Master Theorem: T(n) = aT(n/b) + f(n) — recurrence solution
- Space-time tradeoff: more memory often buys faster runtime

## ⚡ Quick-Fire Facts
- Linked lists have O(1) insert at head but O(n) search
- Hash tables give O(1) average lookup; worst case O(n) with bad hash
- Binary search requires sorted input; gives O(log n) search
- Stacks are LIFO; Queues are FIFO
- Trees with n nodes have n-1 edges
- A complete binary tree of height h has 2^(h+1)-1 nodes
- Dijkstra fails on negative edges; use Bellman-Ford instead
- DFS uses a stack (call stack in recursion); BFS uses a queue
- In-order traversal of a BST gives sorted output
- Merge sort is stable; quicksort is not (in standard form)

## 🧠 Common Mistakes to Avoid
- Confusing worst-case and average-case complexity
- Forgetting base cases in recursive solutions (stack overflow)
- Assuming O(n log n) is always better than O(n²) — constants matter for small n
- Off-by-one errors in binary search boundary conditions
- Modifying a list while iterating over it
"""

_DEMO_QUIZ = [
    {
        "question": "What is the time complexity of binary search on a sorted array of n elements?",
        "options": ["A) O(n)", "B) O(log n)", "C) O(n log n)", "D) O(1)"],
        "correct_answer": "B",
        "explanation": "Binary search halves the search space at each step, giving O(log n). O(n) would be linear search, which doesn't exploit the sorted order.",
        "difficulty": "recall",
    },
    {
        "question": "Which data structure uses LIFO (Last In, First Out) ordering?",
        "options": ["A) Queue", "B) Heap", "C) Stack", "D) Linked List"],
        "correct_answer": "C",
        "explanation": "A stack follows LIFO — the last element pushed is the first popped. Queues use FIFO. This is why the call stack in recursion unwinds in reverse order.",
        "difficulty": "recall",
    },
    {
        "question": "Why does dynamic programming improve over naive recursion?",
        "options": [
            "A) It uses less stack space by being iterative",
            "B) It avoids recomputing overlapping sub-problems by caching results",
            "C) It always finds a globally optimal solution",
            "D) It reduces the number of function calls by using greedy choices",
        ],
        "correct_answer": "B",
        "explanation": "DP's key insight is memoization — store the result of each sub-problem so it's computed only once. This converts exponential-time recursion to polynomial time for problems with overlapping sub-problems.",
        "difficulty": "comprehension",
    },
    {
        "question": "A graph has 7 nodes and 6 edges. Which of the following must be true?",
        "options": [
            "A) The graph contains a cycle",
            "B) The graph is a tree if it is connected",
            "C) Every node has degree at least 2",
            "D) The graph is bipartite",
        ],
        "correct_answer": "B",
        "explanation": "A connected graph with n nodes and exactly n-1 edges is a tree (no cycles). If the graph is connected and has exactly n-1 edges, it satisfies both tree properties.",
        "difficulty": "comprehension",
    },
    {
        "question": "You need to process tasks in the order they arrive, with no priority. Which data structure is most appropriate?",
        "options": ["A) Min-heap", "B) Stack", "C) Queue", "D) Binary search tree"],
        "correct_answer": "C",
        "explanation": "A queue implements FIFO — tasks are processed in arrival order. A stack would reverse the order (LIFO). A heap would introduce priority ordering. This is the classic use case for queues (e.g., job schedulers, BFS).",
        "difficulty": "application",
    },
]

_DEMO_REANCHOR = {
    "question": "In binary search, what happens to the search space at each step?",
    "options": [
        "A) It is halved — we discard the half where the target cannot be",
        "B) It is reduced by one element at a time",
        "C) It is doubled to explore more options",
        "D) It stays the same but we mark visited elements",
    ],
    "correct_answer": "A",
    "explanation": "Binary search compares the target to the middle element and discards the half where the target cannot exist, halving the search space each step — giving O(log n).",
}

_DEMO_SESSION_PLAN = {
    "sprints": [
        {
            "title": "Sprint 1: Foundations & Core Concepts",
            "duration_minutes": 15,
            "focus": "Understand the fundamental definitions and build intuition with examples",
            "material_hint": "Start from the beginning of the material",
        },
        {
            "title": "Sprint 2: Key Algorithms & Patterns",
            "duration_minutes": 15,
            "focus": "Trace through the main algorithms step by step, identify patterns",
            "material_hint": "Focus on the algorithm descriptions and pseudocode",
        },
        {
            "title": "Sprint 3: Complexity & Trade-offs",
            "duration_minutes": 15,
            "focus": "Analyse time and space complexity, understand when to use each approach",
            "material_hint": "Review the complexity tables and comparison sections",
        },
        {
            "title": "Sprint 4: Applications & Practice",
            "duration_minutes": 15,
            "focus": "Apply concepts to practice problems and real-world scenarios",
            "material_hint": "Work through examples and exercises at the end",
        },
        {
            "title": "Sprint 5: Review & Synthesis",
            "duration_minutes": 15,
            "focus": "Connect all ideas, fill gaps, review anything unclear from earlier sprints",
            "material_hint": "Go back to any sections that felt unclear",
        },
        {
            "title": "Sprint 6: Self-Test",
            "duration_minutes": 15,
            "focus": "Quiz yourself on key concepts without looking at the material",
            "material_hint": "Use the key takeaways as a checklist",
        },
    ],
    "total_sprints": 6,
}

_DEMO_TUTOR_RESPONSES = [
    "Great question! The key insight here is that we're trading memory for speed — by caching intermediate results, we avoid repeating work we've already done. Think of it like writing down your work on a math test rather than recalculating the same step twice.",
    "Exactly right! You're thinking about it correctly. The base case is crucial — without it, the recursion never terminates. Always ask: 'What is the simplest version of this problem I can answer directly?'",
    "The difference between BFS and DFS comes down to the data structure used internally. BFS uses a queue (FIFO) so it explores neighbours before going deeper. DFS uses a stack (or the call stack via recursion) so it dives deep before backtracking.",
    "Don't worry — this trips everyone up at first! The trick is to think about *invariants*: what property is always true at each step of the algorithm? Once you identify the invariant, the correctness proof becomes much clearer.",
    "You're on the right track. Remember: O(n log n) doesn't always mean 'better'. For small inputs (n < 20), even O(n²) algorithms can be faster in practice because of lower constant factors and cache behaviour.",
]

_DEMO_REEXPLAIN = """Let me try this from a completely different angle.

**Think of it like GPS navigation:**
Your GPS doesn't calculate every possible route — that would take forever. Instead, it uses smart shortcuts:

1. **Divide the map into zones** — only look at roads near your current location first
2. **Keep a list of "promising" paths** — update it as you discover shorter options
3. **Stop early** — the moment you reach your destination, you're done
4. **Remember dead ends** — don't explore the same road twice

That's essentially what efficient algorithms do with data. The "smart shortcut" changes depending on the problem, but the principle is the same: **avoid unnecessary work**.

**The one thing to remember: Every algorithm is just a strategy for avoiding unnecessary work — the cleverness is in knowing what to skip.**
"""

_DEMO_RETENTION = {
    "overall_retention": 78.5,
    "strong_areas": ["Core definitions", "Algorithm mechanics", "Time complexity basics"],
    "weak_areas": ["Space complexity trade-offs", "Edge cases in recursion"],
    "summary": "Strong performance on foundational concepts with room to deepen understanding of advanced trade-offs.",
    "recommendation": "Review space complexity and practice tracing recursive calls on paper before the next session.",
}

_DEMO_PROFILE_ANALYSIS = {
    "best_focus_time_of_day": "morning",
    "preferred_content_format": "pdf",
    "weak_topics": ["space complexity", "graph algorithms", "dynamic programming edge cases"],
    "insights": "Consistent performance on recall questions; comprehension and application questions show the most growth potential.",
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
