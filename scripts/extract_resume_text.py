import json
import sys


def extract_with_pdfplumber(path):
    import pdfplumber

    pages = []
    with pdfplumber.open(path) as pdf:
        for page in pdf.pages:
            pages.append(page.extract_text() or "")
    return "\n\n".join(pages).strip()


def extract_with_pypdf(path):
    from pypdf import PdfReader

    reader = PdfReader(path)
    pages = [(page.extract_text() or "") for page in reader.pages]
    return "\n\n".join(pages).strip()


def main():
    if len(sys.argv) < 2:
        raise SystemExit("missing pdf path")

    path = sys.argv[1]
    errors = []
    for parser_name, parser in (("pdfplumber", extract_with_pdfplumber), ("pypdf", extract_with_pypdf)):
        try:
            text = parser(path)
            if text:
                print(json.dumps({"text": text, "parser": parser_name}, ensure_ascii=False))
                return
        except Exception as exc:
            errors.append(f"{parser_name}: {exc}")

    print(json.dumps({"text": "", "parser": "", "errors": errors}, ensure_ascii=False))


if __name__ == "__main__":
    main()
