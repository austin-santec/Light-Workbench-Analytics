import re

FORBIDDEN_KEYWORDS = frozenset(
    {
        "INSERT",
        "UPDATE",
        "DELETE",
        "MERGE",
        "DROP",
        "ALTER",
        "CREATE",
        "TRUNCATE",
        "EXEC",
        "EXECUTE",
        "GRANT",
        "REVOKE",
        "DENY",
        "INTO",
        "OPENROWSET",
        "OPENQUERY",
        "OPENDATASOURCE",
        "OPENXML",
        "BULK",
        "SHUTDOWN",
        "KILL",
        "DBCC",
        "WAITFOR",
        "BACKUP",
        "RESTORE",
        "RECONFIGURE",
        "USE",
        "SET",
        "DECLARE",
        "BEGIN",
        "COMMIT",
        "ROLLBACK",
        "SAVE",
        "READTEXT",
        "WRITETEXT",
        "UPDATETEXT",
    }
)

_WORD = re.compile(r"[A-Za-z_#@][A-Za-z0-9_$#@]*")
_IDENTIFIER = r"(?:[A-Za-z_#@][A-Za-z0-9_$#@]*|QIDENT)"


class StatementRejected(ValueError):
    def __init__(self, reason: str):
        self.reason = reason
        super().__init__(reason)


def _visible_sql(sql: str) -> str:
    """Hide comments/literals while retaining statement punctuation and identifier shape."""
    output: list[str] = []
    index = 0
    length = len(sql)
    while index < length:
        char = sql[index]
        following = sql[index + 1] if index + 1 < length else ""

        if char == "-" and following == "-":
            output.extend("  ")
            index += 2
            while index < length and sql[index] not in "\r\n":
                output.append(" ")
                index += 1
            continue

        if char == "/" and following == "*":
            output.extend("  ")
            index += 2
            depth = 1
            while index < length and depth:
                following = sql[index + 1] if index + 1 < length else ""
                if sql[index] == "/" and following == "*":
                    output.extend("  ")
                    index += 2
                    depth += 1
                elif sql[index] == "*" and following == "/":
                    output.extend("  ")
                    index += 2
                    depth -= 1
                else:
                    output.append("\n" if sql[index] == "\n" else " ")
                    index += 1
            continue

        national_prefix = (
            char in "nN"
            and following == "'"
            and (index == 0 or not (sql[index - 1].isalnum() or sql[index - 1] == "_"))
        )
        if char == "'" or national_prefix:
            if national_prefix:
                output.append(" ")
                index += 1
            output.append(" ")
            index += 1
            while index < length:
                if sql[index] == "'":
                    if index + 1 < length and sql[index + 1] == "'":
                        output.extend("  ")
                        index += 2
                        continue
                    output.append(" ")
                    index += 1
                    break
                output.append("\n" if sql[index] == "\n" else " ")
                index += 1
            continue

        if char == "[":
            start = len(output)
            index += 1
            while index < length:
                if sql[index] == "]":
                    if index + 1 < length and sql[index + 1] == "]":
                        index += 2
                        continue
                    index += 1
                    break
                index += 1
            output[start:] = list(" QIDENT ")
            continue

        if char == '"':
            start = len(output)
            index += 1
            while index < length:
                if sql[index] == '"':
                    if index + 1 < length and sql[index + 1] == '"':
                        index += 2
                        continue
                    index += 1
                    break
                index += 1
            output[start:] = list(" QIDENT ")
            continue

        output.append(char)
        index += 1
    return "".join(output)


def validate_console_statement(sql: str) -> str:
    trimmed = sql.strip()
    if not trimmed:
        raise StatementRejected("empty")
    if len(trimmed) > 20_000:
        raise StatementRejected("too_long")

    visible = _visible_sql(trimmed)
    if not visible.strip():
        raise StatementRejected("empty")
    if re.search(r"(?im)^\s*GO\s*;?\s*$", visible):
        raise StatementRejected("multiple_statements")

    semicolon = visible.find(";")
    if semicolon >= 0 and visible[semicolon + 1 :].strip():
        raise StatementRejected("multiple_statements")

    words = [match.group(0).upper() for match in _WORD.finditer(visible)]
    if not words:
        raise StatementRejected("empty")
    if words[0] not in {"SELECT", "WITH"}:
        raise StatementRejected("not_select")

    for word in words:
        if word in FORBIDDEN_KEYWORDS:
            raise StatementRejected(f"forbidden_keyword:{word}")
        if word.startswith("XP_") or word.startswith("SP_"):
            raise StatementRejected(f"forbidden_keyword:{word.split('_', 1)[0]}_")

    identifier_chains = re.finditer(rf"(?i){_IDENTIFIER}(?:\s*\.\s*(?:{_IDENTIFIER})?)+", visible)
    if any(match.group(0).count(".") >= 3 for match in identifier_chains):
        raise StatementRejected("forbidden_keyword:FOUR_PART_NAME")
    if "?" in visible:
        raise StatementRejected("parameters_unsupported")
    return trimmed
