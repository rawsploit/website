<#
  CentraPlant Tally Link
  Reads this PC's Tally (ledgers, stock items and recent vouchers) through Tally's
  own connection on port 9000 and sends them to your company's CentraPlant.
  It also posts into Tally what accounts approved in CentraPlant (new ledgers, new
  stock items and sales bills as Sales vouchers), and reports back what Tally said.
  It only ever creates: it never deletes or alters anything already in Tally.

  First time:   powershell -ExecutionPolicy Bypass -File CentraPlantTallyLink.ps1 -Install
                (copies itself to this PC, syncs now, then every 15 minutes)
  Check only:   ... -File CentraPlantTallyLink.ps1 -Check     (reads Tally, sends nothing)
  Stop it:      ... -File CentraPlantTallyLink.ps1 -Uninstall

  Tally must be open with the company loaded, and in Tally:
  F1 (Help) > Settings > Connectivity > Client/Server configuration:
  TallyPrime acts as = Both, Port = 9000.

  Designed by rawsploit@gmail.com
#>
param([switch]$Install, [switch]$Uninstall, [switch]$Check)

$CoreUrl  = '__CORE_URL__'
$LinkKey  = '__LINK_KEY__'
$Company  = '__COMPANY__'
$TallyUrl = 'http://localhost:9000'
$Days     = 45                       # vouchers from the last 45 days are sent each time
$Every    = 15                       # minutes between syncs
$Agent    = 'tally-link-ps 1.6'

$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$Home_ = Join-Path $env:LOCALAPPDATA 'CentraPlantTallyLink'
$TaskName = 'CentraPlant Tally Link'
if (-not (Test-Path $Home_)) { New-Item -ItemType Directory -Path $Home_ | Out-Null }
$LogFile = Join-Path $Home_ 'link.log'

function Write-Log([string]$msg) {
  $line = (Get-Date -Format 'yyyy-MM-dd HH:mm:ss') + '  ' + $msg
  Add-Content -Path $LogFile -Value $line -Encoding UTF8
  if ([Environment]::UserInteractive) { Write-Host $line }
  # keep the log short
  $all = Get-Content $LogFile -ErrorAction SilentlyContinue
  if ($all -and $all.Count -gt 500) { $all | Select-Object -Last 300 | Set-Content $LogFile -Encoding UTF8 }
}

function XmlEsc([string]$s) { [Security.SecurityElement]::Escape($s) }

# Ask Tally for one collection (inline definition, so nothing has to be added to Tally)
function Get-TallyCollection([string]$type, [string]$fetch, [string]$from, [string]$to) {
  $vars = '<SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT><SVCURRENTCOMPANY>' + (XmlEsc $Company) + '</SVCURRENTCOMPANY>'
  if ($from) { $vars += '<SVFROMDATE TYPE="Date">' + $from + '</SVFROMDATE><SVTODATE TYPE="Date">' + $to + '</SVTODATE>' }
  $name = 'CPLink' + $type
  $body = '<ENVELOPE><HEADER><VERSION>1</VERSION><TALLYREQUEST>Export</TALLYREQUEST><TYPE>Collection</TYPE><ID>' + $name + '</ID></HEADER>' +
          '<BODY><DESC><STATICVARIABLES>' + $vars + '</STATICVARIABLES><TDL><TDLMESSAGE>' +
          '<COLLECTION NAME="' + $name + '" ISMODIFY="No"><TYPE>' + $type + '</TYPE><FETCH>' + $fetch + '</FETCH></COLLECTION>' +
          '</TDLMESSAGE></TDL></DESC></BODY></ENVELOPE>'
  $res = Invoke-WebRequest -Uri $TallyUrl -Method Post -Body ([Text.Encoding]::UTF8.GetBytes($body)) `
           -ContentType 'text/xml; charset=utf-8' -UseBasicParsing -TimeoutSec 180
  # Tally sometimes sends control characters that XML readers refuse
  $text = $res.Content -replace '&#(?:[0-8]|1[1-2]|1[4-9]|2[0-9]|3[01]);', '' -replace '[\x00-\x08\x0B\x0C\x0E-\x1F]', ''
  [xml]$x = $text
  return $x
}

function Num($v) {
  if ($null -eq $v) { return 0 }
  $s = ([string]$v) -replace '[^0-9\.\-]', ''
  if ($s -eq '' -or $s -eq '-') { return 0 }
  return [math]::Round([double]$s, 2)
}
function Txt($node, [string]$name) {
  if ($null -eq $node) { return '' }
  $v = $node.$name
  if ($v -is [System.Xml.XmlElement]) { return [string]$v.InnerText }
  if ($null -eq $v) { return '' }
  return [string]$v
}
function NameOf($node) {
  $n = $node.GetAttribute('NAME')
  if (-not $n) { $n = Txt $node 'NAME' }
  return [string]$n
}
function Nodes($parent, [string]$name) {
  if ($null -eq $parent) { return @() }
  $n = $parent.$name
  if ($null -eq $n) { return @() }
  return @($n)
}

function Read-Tally {
  # balances up to today, from the start of this financial year (1 April)
  $inv = [Globalization.CultureInfo]::InvariantCulture
  $today = Get-Date
  $fy = if ($today.Month -ge 4) { $today.Year } else { $today.Year - 1 }
  $fyFrom = (Get-Date -Year $fy -Month 4 -Day 1).ToString('d-MMM-yyyy', $inv)
  $upTo = $today.ToString('d-MMM-yyyy', $inv)
  # 1. ledgers with their group and balances (Tally: negative = debit)
  $x = Get-TallyCollection 'Ledger' 'NAME,PARENT,OPENINGBALANCE,CLOSINGBALANCE,PARTYGSTIN,LEDGERMOBILE,LEDGERPHONE' $fyFrom $upTo
  $ledgers = @()
  foreach ($l in (Nodes $x.ENVELOPE.BODY.DATA.COLLECTION 'LEDGER')) {
    $ledgers += @{ name = (NameOf $l); group = (Txt $l 'PARENT'); opening = (Num (Txt $l 'OPENINGBALANCE'));
                   closing = (Num (Txt $l 'CLOSINGBALANCE')); gstin = (Txt $l 'PARTYGSTIN');
                   phone = $(if (Txt $l 'LEDGERMOBILE') { Txt $l 'LEDGERMOBILE' } else { Txt $l 'LEDGERPHONE' }) }
  }
  # 2. stock items with closing quantity and value
  $x = Get-TallyCollection 'StockItem' 'NAME,PARENT,BASEUNITS,CLOSINGBALANCE,CLOSINGVALUE' $fyFrom $upTo
  $items = @()
  foreach ($i in (Nodes $x.ENVELOPE.BODY.DATA.COLLECTION 'STOCKITEM')) {
    $items += @{ name = (NameOf $i); group = (Txt $i 'PARENT'); unit = (Txt $i 'BASEUNITS');
                 qty = (Num (Txt $i 'CLOSINGBALANCE')); value = (Num (Txt $i 'CLOSINGVALUE')) }
  }
  # 3. vouchers from the last $Days days, with their ledger lines
  $toD = Get-Date; $fromD = $toD.AddDays(-$Days)
  $from = $fromD.ToString('d-MMM-yyyy', [Globalization.CultureInfo]::InvariantCulture)
  $to   = $toD.ToString('d-MMM-yyyy', [Globalization.CultureInfo]::InvariantCulture)
  $x = Get-TallyCollection 'Voucher' 'DATE,VOUCHERTYPENAME,VOUCHERNUMBER,PARTYLEDGERNAME,NARRATION,GUID,ALLLEDGERENTRIES.LIST,LEDGERENTRIES.LIST,ALLINVENTORYENTRIES.LIST' $from $to
  $vouchers = @()
  foreach ($v in (Nodes $x.ENVELOPE.BODY.DATA.COLLECTION 'VOUCHER')) {
    # Tally can list the same line under both ALLLEDGERENTRIES and LEDGERENTRIES:
    # take ALLLEDGERENTRIES, and LEDGERENTRIES only when the first is empty.
    $lines = @()
    $entries = @(Nodes $v 'ALLLEDGERENTRIES.LIST')
    if ($entries.Count -eq 0) { $entries = @(Nodes $v 'LEDGERENTRIES.LIST') }
    foreach ($e in $entries) {
      $ln = Txt $e 'LEDGERNAME'
      if ($ln) { $lines += @{ ledger = $ln; amount = (Num (Txt $e 'AMOUNT')) } }
    }
    # item invoices keep the sales / purchase ledger under each item: add it if the voucher doesn't balance yet
    $sum = 0; foreach ($ln in $lines) { $sum += $ln.amount }
    if ([math]::Abs($sum) -gt 0.005) {
      foreach ($ie in @(Nodes $v 'ALLINVENTORYENTRIES.LIST')) {
        foreach ($ae in @(Nodes $ie 'ACCOUNTINGALLOCATIONS.LIST')) {
          $ln = Txt $ae 'LEDGERNAME'
          if ($ln) { $lines += @{ ledger = $ln; amount = (Num (Txt $ae 'AMOUNT')) } }
        }
      }
    }
    $party = Txt $v 'PARTYLEDGERNAME'
    $amount = 0
    $pl = $lines | Where-Object { $_.ledger -eq $party } | Select-Object -First 1
    if ($pl) { $amount = [math]::Abs($pl.amount) }
    else { foreach ($ln in $lines) { if ($ln.amount -lt 0) { $amount += -$ln.amount } } }
    $vouchers += @{ date = (Txt $v 'DATE'); type = (Txt $v 'VOUCHERTYPENAME'); number = (Txt $v 'VOUCHERNUMBER');
                    party = $party; amount = $amount; narration = (Txt $v 'NARRATION'); guid = (Txt $v 'GUID'); ledgers = $lines }
  }
  return @{ ledgers = $ledgers; items = $items; vouchers = $vouchers;
            from = $fromD.ToString('yyyyMMdd'); to = $toD.ToString('yyyyMMdd') }
}

function Send-ToCentraPlant($payload) {
  $json = $payload | ConvertTo-Json -Depth 6 -Compress
  $res = Invoke-RestMethod -Uri $CoreUrl -Method Post -Body ([Text.Encoding]::UTF8.GetBytes($json)) `
           -ContentType 'text/plain; charset=utf-8' -TimeoutSec 300
  return $res
}

function Tell-Problem([string]$msg) {
  try { Send-ToCentraPlant @{ action = 'tallyProblem'; key = $LinkKey; message = $msg } | Out-Null } catch { }
}


# ---------------- posting into Tally ----------------
function Post-ToTally([string]$xml) {
  # safety: refuse anything that would delete, alter or cancel in Tally
  if ($xml -match 'ACTION="(?!Create")[^"]*"' -or $xml -match '(?i)<(DELETE|ALTER|CANCEL)\b') { throw 'Refused: this link only creates new entries in Tally.' }
  $res = Invoke-WebRequest -Uri $TallyUrl -Method Post -Body ([Text.Encoding]::UTF8.GetBytes($xml)) `
           -ContentType 'text/xml; charset=utf-8' -UseBasicParsing -TimeoutSec 120
  return [string]$res.Content
}

# what Tally answered to an import: counts and any line errors
function Read-ImportResult([string]$text) {
  $get = { param($tag) $m = [regex]::Match($text, '<' + $tag + '>\s*(-?\d+)\s*</' + $tag + '>'); if ($m.Success) { [int]$m.Groups[1].Value } else { 0 } }
  $errs = @([regex]::Matches($text, '<LINEERROR>(.*?)</LINEERROR>', 'Singleline') | ForEach-Object { $_.Groups[1].Value.Trim() } | Where-Object { $_ })
  return @{ created = (& $get 'CREATED'); altered = (& $get 'ALTERED'); errors = (& $get 'ERRORS'); exceptions = (& $get 'EXCEPTIONS');
            message = ($errs -join '; ') }
}


# a new stock item; $full = $false leaves out HSN/GST (used if Tally refuses them)
function Item-Xml($p, [bool]$full) {
  $n = XmlEsc ([string]$p.name)
  $x = '<STOCKITEM NAME="' + $n + '" ACTION="Create"><NAME.LIST TYPE="String"><NAME>' + $n + '</NAME></NAME.LIST>' +
       '<PARENT>' + (XmlEsc $(if ($p.parent) { [string]$p.parent } else { 'Primary' })) + '</PARENT>' +
       '<BASEUNITS>' + (XmlEsc $(if ($p.unit) { [string]$p.unit } else { 'Nos' })) + '</BASEUNITS>'
  if ($full -and $p.hsn) { $x += '<GSTAPPLICABLE>&#4; Applicable</GSTAPPLICABLE><HSNCODE>' + (XmlEsc ([string]$p.hsn)) + '</HSNCODE>' }
  return $x + '</STOCKITEM>'
}

function Amt($v) { return ([double]$v).ToString('0.00', [Globalization.CultureInfo]::InvariantCulture) }
function Qty($v) { return ([double]$v).ToString('0.###', [Globalization.CultureInfo]::InvariantCulture) }

# a Sales voucher (item invoice): party Dr total; items Cr at taxable value into the sales ledger; GST and round off
function Sales-Xml($p) {
  $vt = XmlEsc ([string]$p.vtype); $party = XmlEsc ([string]$p.party); $no = XmlEsc ([string]$p.number)
  $date = ([string]$p.date) -replace '-', ''
  $x = '<VOUCHER VCHTYPE="' + $vt + '" ACTION="Create" OBJVIEW="Invoice Voucher View">' +
       '<DATE>' + $date + '</DATE><VOUCHERTYPENAME>' + $vt + '</VOUCHERTYPENAME><VOUCHERNUMBER>' + $no + '</VOUCHERNUMBER>' +
       '<REFERENCE>' + $no + '</REFERENCE><PARTYLEDGERNAME>' + $party + '</PARTYLEDGERNAME><PARTYNAME>' + $party + '</PARTYNAME>' +
       '<BASICBUYERNAME>' + $party + '</BASICBUYERNAME><PERSISTEDVIEW>Invoice Voucher View</PERSISTEDVIEW><ISINVOICE>Yes</ISINVOICE>' +
       '<VCHENTRYMODE>Item Invoice</VCHENTRYMODE><NARRATION>' + (XmlEsc ([string]$p.narration)) + '</NARRATION>' +
       '<LEDGERENTRIES.LIST><LEDGERNAME>' + $party + '</LEDGERNAME><ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE><ISPARTYLEDGER>Yes</ISPARTYLEDGER>' +
       '<AMOUNT>-' + (Amt $p.total) + '</AMOUNT><BILLALLOCATIONS.LIST><NAME>' + $no + '</NAME><BILLTYPE>New Ref</BILLTYPE>' +
       '<AMOUNT>-' + (Amt $p.total) + '</AMOUNT></BILLALLOCATIONS.LIST></LEDGERENTRIES.LIST>'
  foreach ($l in @($p.lines)) {
    $u = XmlEsc ([string]$l.unit)
    $billed = [double]$l.qty; $actual = $billed + [double]$l.free
    $x += '<ALLINVENTORYENTRIES.LIST><STOCKITEMNAME>' + (XmlEsc ([string]$l.item)) + '</STOCKITEMNAME><ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>' +
          '<RATE>' + ([double]$l.rate).ToString('0.####', [Globalization.CultureInfo]::InvariantCulture) + '/' + $u + '</RATE>' +
          '<AMOUNT>' + (Amt $l.amount) + '</AMOUNT><ACTUALQTY> ' + (Qty $actual) + ' ' + $u + '</ACTUALQTY><BILLEDQTY> ' + (Qty $billed) + ' ' + $u + '</BILLEDQTY>' +
          '<ACCOUNTINGALLOCATIONS.LIST><LEDGERNAME>' + (XmlEsc ([string]$p.sales)) + '</LEDGERNAME><ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>' +
          '<AMOUNT>' + (Amt $l.amount) + '</AMOUNT></ACCOUNTINGALLOCATIONS.LIST></ALLINVENTORYENTRIES.LIST>'
  }
  foreach ($t in @($p.taxes)) {
    if (-not $t) { continue }
    $x += '<LEDGERENTRIES.LIST><LEDGERNAME>' + (XmlEsc ([string]$t.ledger)) + '</LEDGERNAME><ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>' +
          '<AMOUNT>' + (Amt $t.amount) + '</AMOUNT></LEDGERENTRIES.LIST>'
  }
  if ($p.round) {
    $r = [double]$p.round.amount
    $x += '<LEDGERENTRIES.LIST><LEDGERNAME>' + (XmlEsc ([string]$p.round.ledger)) + '</LEDGERNAME><ISDEEMEDPOSITIVE>' + $(if ($r -lt 0) { 'Yes' } else { 'No' }) + '</ISDEEMEDPOSITIVE>' +
          '<AMOUNT>' + (Amt $r) + '</AMOUNT></LEDGERENTRIES.LIST>'
  }
  return $x + '</VOUCHER>'
}

function Import-Envelope([string]$inner, [string]$report = 'All Masters') {
  return '<ENVELOPE><HEADER><TALLYREQUEST>Import Data</TALLYREQUEST></HEADER><BODY><IMPORTDATA><REQUESTDESC>' +
         '<REPORTNAME>' + $report + '</REPORTNAME><STATICVARIABLES><SVCURRENTCOMPANY>' + (XmlEsc $Company) + '</SVCURRENTCOMPANY></STATICVARIABLES>' +
         '</REQUESTDESC><REQUESTDATA><TALLYMESSAGE xmlns:UDF="TallyUDF">' + $inner + '</TALLYMESSAGE></REQUESTDATA></IMPORTDATA></BODY></ENVELOPE>'
}

# a new ledger; $full = $false leaves out address and GST details (used if Tally refuses them)
# This script only ever CREATES ledgers. It never deletes or alters anything in Tally.
function Ledger-Xml($p, [bool]$full) {
  $n = XmlEsc ([string]$p.name)
  $bw = $(if ($p.billwise -eq $false) { 'No' } else { 'Yes' })
  $x = '<LEDGER NAME="' + $n + '" ACTION="Create"><NAME.LIST TYPE="String"><NAME>' + $n + '</NAME></NAME.LIST>' +
       '<PARENT>' + (XmlEsc ([string]$p.parent)) + '</PARENT><ISBILLWISEON>' + $bw + '</ISBILLWISEON>'
  if ($full -and $p.taxType) {
    $x += '<TAXTYPE>' + (XmlEsc ([string]$p.taxType)) + '</TAXTYPE>'
    if ($p.duty) { $x += '<GSTDUTYHEAD>' + (XmlEsc ([string]$p.duty)) + '</GSTDUTYHEAD>' }
  }
  if ($full) {
    if ($p.address) { $x += '<ADDRESS.LIST TYPE="String"><ADDRESS>' + (XmlEsc ([string]$p.address)) + '</ADDRESS></ADDRESS.LIST>' }
    if ($p.state)   { $x += '<LEDSTATENAME>' + (XmlEsc ([string]$p.state)) + '</LEDSTATENAME><COUNTRYNAME>India</COUNTRYNAME>' }
    if ($p.phone)   { $x += '<LEDGERMOBILE>' + (XmlEsc ([string]$p.phone)) + '</LEDGERMOBILE>' }
    if ($p.gstin)   { $x += '<GSTREGISTRATIONTYPE>Regular</GSTREGISTRATIONTYPE><PARTYGSTIN>' + (XmlEsc ([string]$p.gstin)) + '</PARTYGSTIN>' }
  }
  return $x + '</LEDGER>'
}

# Collect what accounts approved, post each into Tally, report back. Returns how many were created.
function Send-Outbox($ledgers, $stock, $vouchers) {
  $res = Send-ToCentraPlant @{ action = 'tallyOutboxPull'; key = $LinkKey }
  if (-not $res.ok) { Write-Log ('Outbox: ' + $res.message); return 0 }
  $items = @($res.items | Where-Object { $_ })
  if ($items.Count -eq 0) { return 0 }
  $have = @{}; $haveItem = @{}; $haveVch = @{}
  foreach ($l in $ledgers) { if ($l.name) { $have[([string]$l.name).Trim().ToLower()] = $true } }
  foreach ($i in $stock) { if ($i.name) { $haveItem[([string]$i.name).Trim().ToLower()] = $true } }
  foreach ($v in $vouchers) { if ($v.number) { $haveVch[([string]$v.type + '|' + [string]$v.number).ToLower()] = $true } }
  $results = @(); $made = 0; $there = 0; $bad = 0
  foreach ($it in $items) {
    $r = @{ id = $it.id; status = 'failed'; message = '' }
    try {
      if ($it.kind -eq 'item') {
        $key = ([string]$it.payload.name).Trim().ToLower()
        if ($haveItem.ContainsKey($key)) { $r.status = 'exists'; $r.message = 'Already in Tally'; $there++ }
        else {
          $ans = Read-ImportResult (Post-ToTally (Import-Envelope (Item-Xml $it.payload $true)))
          if ($ans.created -lt 1) { $first = $ans.message; $ans = Read-ImportResult (Post-ToTally (Import-Envelope (Item-Xml $it.payload $false)))
            if ($ans.created -ge 1) { $ans.message = 'Created in Tally without HSN/GST details (Tally said: ' + $first + '). Add them in Tally.' } }
          if ($ans.created -ge 1) { $r.status = 'posted'; $r.message = $(if ($ans.message) { $ans.message } else { 'Created in Tally' }); $made++; $haveItem[$key] = $true }
          elseif ($ans.message -match 'already exists|duplicate') { $r.status = 'exists'; $r.message = 'Already in Tally'; $there++ }
          else { $r.message = $(if ($ans.message) { 'Tally said: ' + $ans.message } else { "Tally didn't accept it (no reason given)." }); $bad++ }
        }
        $results += $r; continue
      }
      if ($it.kind -eq 'sales') {
        $key = ([string]$it.payload.vtype + '|' + [string]$it.payload.number).ToLower()
        if ($haveVch.ContainsKey($key)) { $r.status = 'exists'; $r.message = 'A ' + $it.payload.vtype + ' voucher with this number is already in Tally'; $there++ }
        else {
          $ans = Read-ImportResult (Post-ToTally (Import-Envelope (Sales-Xml $it.payload) 'Vouchers'))
          if ($ans.created -ge 1) { $r.status = 'posted'; $r.message = 'Sales voucher created in Tally'; $made++; $haveVch[$key] = $true }
          else { $r.message = $(if ($ans.message) { 'Tally said: ' + $ans.message } else { "Tally didn't accept the voucher (no reason given)." }); $bad++ }
        }
        $results += $r; continue
      }
      if ($it.kind -ne 'ledger') { $r.message = 'This Tally Link is too old for "' + $it.kind + '". Download it again from Company setup > Accounts.' }
      elseif ($have.ContainsKey(([string]$it.payload.name).Trim().ToLower())) { $r.status = 'exists'; $r.message = 'Already in Tally'; $there++ }
      else {
        $ans = Read-ImportResult (Post-ToTally (Import-Envelope (Ledger-Xml $it.payload $true)))
        if ($ans.created -lt 1 -and $ans.altered -lt 1) {
          # try again with just the name and group, in case this Tally refused the address or GST fields
          $first = $ans.message
          $ans = Read-ImportResult (Post-ToTally (Import-Envelope (Ledger-Xml $it.payload $false)))
          if ($ans.created -ge 1) { $ans.message = 'Created in Tally without address/GST details (Tally said: ' + $first + '). Add them in Tally.' }
        }
        if ($ans.created -ge 1 -or $ans.altered -ge 1) {
          $r.status = 'posted'; if (-not $ans.message) { $ans.message = 'Created in Tally' }; $r.message = $ans.message; $made++
          $have[([string]$it.payload.name).Trim().ToLower()] = $true
        } elseif ($ans.message -match 'already exists|duplicate') { $r.status = 'exists'; $r.message = 'Already in Tally'; $there++ }
        else { $r.message = $(if ($ans.message) { 'Tally said: ' + $ans.message } else { "Tally didn't accept it (no reason given)." }); $bad++ }
      }
    } catch { $r.message = 'Problem posting: ' + $_.Exception.Message; $bad++ }
    $results += $r
  }
  $back = Send-ToCentraPlant @{ action = 'tallyOutboxResult'; key = $LinkKey; results = $results }
  Write-Log ('Posted to Tally: ' + $made + ' created, ' + $there + ' already there, ' + $bad + ' failed.')
  if (-not $back.ok) { Write-Log ('CentraPlant said: ' + $back.message) }
  return $made
}

# ---------------- install / uninstall ----------------
if ($Uninstall) {
  schtasks.exe /Delete /TN $TaskName /F 2>$null | Out-Null
  Remove-Item -Path (Join-Path $Home_ 'run-hidden.vbs') -ErrorAction SilentlyContinue
  Write-Log 'Stopped: automatic sync removed.'
  exit 0
}
if ($Install) {
  $target = Join-Path $Home_ 'CentraPlantTallyLink.ps1'
  if ($PSCommandPath -ne $target) { Copy-Item -Path $PSCommandPath -Destination $target -Force }
  # PowerShell flashes a window for a moment even when "hidden", so a tiny VBScript
  # starts it instead: wscript runs with no window at all (mode 0 = hidden).
  $vbs = Join-Path $Home_ 'run-hidden.vbs'
  $ps = 'powershell.exe -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File ""' + $target + '""'
  Set-Content -Path $vbs -Encoding ASCII -Value @(
    'Set sh = CreateObject("WScript.Shell")',
    ('sh.Run "' + $ps + '", 0, False')
  )
  $cmd = 'wscript.exe "' + $vbs + '"'
  schtasks.exe /Create /SC MINUTE /MO $Every /TN $TaskName /TR $cmd /F | Out-Null
  Write-Log ('Installed: syncing every ' + $Every + ' minutes while you are signed in to Windows.')
}

# ---------------- one sync ----------------
try {
  Write-Log ('Reading Tally (' + $Company + ')...')
  $data = Read-Tally
  Write-Log ('Found ' + $data.ledgers.Count + ' ledgers, ' + $data.items.Count + ' stock items, ' + $data.vouchers.Count + ' vouchers.')
  if ($Check) { Write-Log 'Check only: nothing sent.'; exit 0 }
  # first post what accounts approved, then send Tally (with anything just created) to CentraPlant
  $made = 0
  try { $made = Send-Outbox $data.ledgers $data.items $data.vouchers } catch { Write-Log ('Outbox problem: ' + $_.Exception.Message) }
  if ($made -gt 0) { $data = Read-Tally }
  $payload = @{ action = 'tallyPush'; key = $LinkKey; company = $Company; agent = $Agent;
                from = $data.from; to = $data.to; ledgers = $data.ledgers; items = $data.items; vouchers = $data.vouchers }
  $res = Send-ToCentraPlant $payload
  if ($res.ok) {
    Write-Log 'Sent to CentraPlant.'
    if ($res.nameMatches -eq $false) { Write-Log 'Note: the company name in Tally differs from the one in CentraPlant.' }
  } else {
    Write-Log ('CentraPlant said: ' + $res.message)
  }
} catch {
  $m = $_.Exception.Message
  if ($m -match 'Unable to connect|actively refused|No connection') { $m = "Couldn't reach Tally. Is Tally open with " + $Company + ' loaded, and is its connection on port 9000 switched on?' }
  Write-Log ('Problem: ' + $m)
  if (-not $Check) { Tell-Problem $m }
  exit 1
}
