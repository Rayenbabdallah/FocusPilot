from app.utils.text_processing import clean_text, split_into_sentences, estimate_read_time_minutes


def test_clean_text_normalizes_spaces_and_quotes() -> None:
    raw = "Hello\u2019s   world!!!\n\nNew\tline"
    cleaned = clean_text(raw)
    assert cleaned == "Hello s world!! New line"


def test_split_into_sentences_splits_on_terminal_punctuation() -> None:
    text = "This is first. This is second! This is third?"
    assert split_into_sentences(text) == ["This is first.", "This is second!", "This is third?"]


def test_estimate_read_time_minutes_handles_empty_and_non_empty() -> None:
    assert estimate_read_time_minutes("") == 0.0
    assert estimate_read_time_minutes("word " * 200) == 1.0
