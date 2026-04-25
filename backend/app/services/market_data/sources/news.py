"""News source connector — RSS feed aggregation.

Fetches financial news from Vietnamese RSS feeds (reverse-engineered from
vnstock_news/config/sites.py). No dependency on vnstock_news.
"""

from __future__ import annotations

import re
import xml.etree.ElementTree as ET
from typing import Any

import httpx

from app.services.market_data.http import get_headers

_SOURCE = "RSS"

# Top Vietnamese financial news RSS feeds (from vnstock_news/config/sites.py)
RSS_FEEDS: dict[str, list[str]] = {
    "vnexpress": ["https://vnexpress.net/rss/tin-moi-nhat.rss"],
    "tuoitre": [
        "https://tuoitre.vn/rss/tin-moi-nhat.rss",
        "https://tuoitre.vn/rss/kinh-doanh.rss",
    ],
    "cafebiz": [
        "https://cafebiz.vn/rss/home.rss",
        "https://cafebiz.vn/rss/vi-mo.rss",
    ],
    "vietstock": [
        "https://vietstock.vn/761/kinh-te/vi-mo.rss",
        "https://vietstock.vn/768/kinh-te/kinh-te-dau-tu.rss",
    ],
    "thanhnien": ["https://thanhnien.vn/rss/home.rss"],
    "dantri": ["https://dantri.com.vn/rss/tin-moi-nhat.rss"],
    "vietnamnet": ["https://vietnamnet.vn/rss/tin-moi-nhat.rss"],
}

SUPPORTED_SITES = list(RSS_FEEDS.keys())


def _strip_cdata(text: str | None) -> str:
    """Remove CDATA wrappers and HTML tags from text."""
    if not text:
        return ""
    text = text.strip()
    text = re.sub(r"<!\[CDATA\[(.*?)\]\]>", r"\1", text, flags=re.DOTALL)
    text = re.sub(r"<[^>]+>", "", text)
    return text.strip()


def _extract_image(description: str | None) -> str:
    """Extract first image URL from HTML description."""
    if not description:
        return ""
    match = re.search(r'<img[^>]+src=["\']([^"\']+)["\']', description)
    return match.group(1) if match else ""


async def fetch_rss_news(
    *,
    sites: list[str] | None = None,
    max_per_site: int = 20,
) -> tuple[list[dict[str, Any]], str]:
    """Fetch news articles from RSS feeds.

    sites: list of site names to fetch from (default: all)
    max_per_site: max articles per site
    """
    target_sites = sites if sites else SUPPORTED_SITES

    records: list[dict[str, Any]] = []
    fetched_urls: list[str] = []

    headers = get_headers(_SOURCE)
    headers["Accept"] = "application/rss+xml, application/xml, text/xml"

    async with httpx.AsyncClient(timeout=10.0) as client:
        for site_name in target_sites:
            feed_urls = RSS_FEEDS.get(site_name, [])
            for feed_url in feed_urls:
                try:
                    resp = await client.get(feed_url, headers=headers)
                    resp.raise_for_status()
                    fetched_urls.append(feed_url)

                    items = _parse_rss_xml(resp.text, site_name)
                    records.extend(items[:max_per_site])
                except Exception:
                    continue  # Skip failed feeds silently

    # Deduplicate by link
    seen: set[str] = set()
    unique: list[dict[str, Any]] = []
    for item in records:
        link = item.get("link", "")
        if link and link not in seen:
            seen.add(link)
            unique.append(item)

    endpoint_desc = ",".join(fetched_urls[:3])
    if len(fetched_urls) > 3:
        endpoint_desc += f"...+{len(fetched_urls) - 3} more"

    return unique, endpoint_desc


def _parse_rss_xml(xml_text: str, site_name: str) -> list[dict[str, Any]]:
    """Parse RSS XML into normalized article dicts."""
    records: list[dict[str, Any]] = []
    try:
        root = ET.fromstring(xml_text)
    except ET.ParseError:
        return records

    # Find all <item> elements (standard RSS 2.0)
    items = root.findall(".//item")
    for item in items:
        title = _strip_cdata(item.findtext("title"))
        link = _strip_cdata(item.findtext("link"))
        description_raw = item.findtext("description") or ""
        description = _strip_cdata(description_raw)
        pub_date = _strip_cdata(item.findtext("pubDate"))
        image_url = _extract_image(description_raw)

        if not title or not link:
            continue

        records.append({
            "title": title,
            "link": link,
            "description": description[:500] if description else "",
            "pub_date": pub_date,
            "image_url": image_url,
            "site": site_name,
        })

    return records
