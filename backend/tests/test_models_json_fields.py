from app.models.material import Material
from app.models.quiz import Quiz


def test_material_chunks_roundtrip() -> None:
    material = Material(student_id="s1", title="T", type="text")
    data = [{"index": 0, "text": "hello", "word_count": 1}]

    material.set_chunks(data)

    assert material.get_chunks() == data


def test_quiz_questions_and_answers_roundtrip() -> None:
    quiz = Quiz(sprint_id="sp1", session_id="se1", questions="[]")
    questions = [{"question": "Q1", "options": ["A"], "correct_answer": "A"}]
    answers = ["A"]

    quiz.set_questions(questions)
    quiz.set_answers(answers)

    assert quiz.get_questions() == questions
    assert quiz.get_answers() == answers
