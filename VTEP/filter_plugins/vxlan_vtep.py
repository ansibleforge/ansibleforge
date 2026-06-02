# -*- coding: utf-8 -*-
# Ansible filter plugin: parse "show platform trident vxlan vtep detail"
#
# It groups the raw command text into per-VTEP-IP sections and reports which
# VTEPs have a head-end-replication (HER) tunnel programmed but NO unicast
# VXLAN tunnel. Those are the entries the operator wants to find.
#
# IMPORTANT: this parser makes one assumption about the output layout:
#   the output is indentation-structured. A VTEP "section" starts on a
#   header line that contains an IPv4 address and sits at the OUTERMOST
#   indent level; the detail lines underneath it (vxlanHwHerTunnel /
#   vxlanTunnel, nexthop, etc.) are indented further and belong to that VTEP.
#   The header indent is auto-detected from the first IP-bearing line, so the
#   absolute amount of indentation does not matter - only that detail lines
#   are indented MORE than their header. This stops nexthop/underlay IPs that
#   appear inside a block from being mistaken for new VTEPs.
# Validate that assumption against ONE real device before trusting 500 runs.
# See README.md -> "Step 0: validate the parser".

from __future__ import absolute_import, division, print_function

__metaclass__ = type

import re

IP_RE = re.compile(r"\b(\d{1,3}(?:\.\d{1,3}){3})\b")


def _norm(text):
    """Lowercase and strip everything but [a-z0-9] so token matching is robust
    to spacing, punctuation and capitalization differences in the CLI output."""
    return re.sub(r"[^a-z0-9]", "", text.lower())


def parse_vxlan_vtep(raw, her_token="vxlanHwHerTunnel", uni_token="vxlanTunnel"):
    """Parse raw CLI text and return a dict describing every remote VTEP IP.

    Returns:
      {
        "vteps":        [ {ip, has_her, has_unicast, lines}, ... ],
        "suspect":      [ <same shape, only HER-without-unicast entries> ],
        "suspect_ips":  [ "10.0.0.1", ... ],
        "total":        <int total distinct VTEP IPs seen>,
        "suspect_count":<int>,
        "parsed_ok":    <bool - False if we found no IPs at all>
      }
    """
    her_n = _norm(her_token)
    uni_n = _norm(uni_token)

    lines = raw.splitlines() if raw else []

    def indent_of(s):
        return len(s) - len(s.lstrip())

    # Auto-detect the header indent: the indentation of the first IP-bearing
    # line. Header (VTEP) lines sit at this level; detail lines are indented
    # further and must NOT start a new section.
    base_indent = None
    for line in lines:
        if IP_RE.search(line):
            base_indent = indent_of(line)
            break

    # 1. Split into sections. A new VTEP section starts on an IP-bearing line
    #    whose indent is at the header level (<= base_indent). More-indented
    #    IP-bearing lines (e.g. "nexthop 192.168.1.1") attach to the current
    #    section instead of starting a new one.
    sections = []
    current = None
    for line in lines:
        m = IP_RE.search(line)
        is_header = m is not None and (
            base_indent is None or indent_of(line) <= base_indent
        )
        if is_header:
            if current is not None:
                sections.append(current)
            current = {"ip": m.group(1), "lines": [line]}
        elif current is not None:
            current["lines"].append(line)
    if current is not None:
        sections.append(current)

    # 2. Merge sections that share the same VTEP IP (an IP can appear in more
    #    than one block) and evaluate the two tokens over the merged text.
    by_ip = {}
    for sec in sections:
        ip = sec["ip"]
        entry = by_ip.setdefault(
            ip, {"ip": ip, "has_her": False, "has_unicast": False, "lines": []}
        )
        entry["lines"].extend(sec["lines"])
        blob = _norm("\n".join(sec["lines"]))
        if her_n in blob:
            entry["has_her"] = True
        if uni_n in blob:
            entry["has_unicast"] = True

    vteps = list(by_ip.values())
    suspect = [v for v in vteps if v["has_her"] and not v["has_unicast"]]

    return {
        "vteps": vteps,
        "suspect": suspect,
        "suspect_ips": [v["ip"] for v in suspect],
        "total": len(vteps),
        "suspect_count": len(suspect),
        "parsed_ok": len(vteps) > 0,
    }


def ip_to_trident_hex(ip):
    """Convert a dotted-quad IPv4 string to its packed 32-bit hex form with the
    leading zero padding stripped.

    e.g. "10.1.1.10" -> 0x0a01010a -> "a01010a", "0.0.0.0" -> "0".

    This is the form a VTEP IP appears as inside the Broadcom Trident diag
    tables, so the operator can search for it in the output of
    "platform trident diag d chg MPLS_ENTRY_SINGLE".
    """
    m = IP_RE.search(str(ip))
    if not m:
        return ""
    value = 0
    for octet in m.group(1).split("."):
        value = (value << 8) | (int(octet) & 0xFF)
    # format(..., "x") yields lowercase hex with no "0x" and no leading zeros
    # (and "0" for a zero value) - i.e. the padding is already stripped.
    return format(value, "x")


def trident_mpls_hits(suspect_ips, mpls_raw):
    """For each suspect VTEP IP, compute its leading-zero-stripped hex key and
    search the raw "platform trident diag d chg MPLS_ENTRY_SINGLE" output for it.

    Returns one dict per IP:
      {ip, hex, found, match_count, matches}

    Matching is case-insensitive substring, so the key hits whether the dump
    prints the value padded ("0x0a01010a") or not ("0xa01010a"): the stripped
    key "a01010a" is a substring of both.
    """
    lines = (mpls_raw or "").splitlines()
    lowered = [ln.lower() for ln in lines]
    hits = []
    for ip in (suspect_ips or []):
        key = ip_to_trident_hex(ip)
        matches = [lines[i] for i, ln in enumerate(lowered) if key and key in ln]
        hits.append(
            {
                "ip": ip,
                "hex": key,
                "found": bool(matches),
                "match_count": len(matches),
                "matches": matches,
            }
        )
    return hits


class FilterModule(object):
    def filters(self):
        return {
            "parse_vxlan_vtep": parse_vxlan_vtep,
            "ip_to_trident_hex": ip_to_trident_hex,
            "trident_mpls_hits": trident_mpls_hits,
        }
