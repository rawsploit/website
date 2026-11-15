<#
  Kalavara Tally Link
  Reads this PC's Tally (ledgers, stock items and recent vouchers) through Tally's
  own connection on port 9000 and sends them to your company's Kalavara.

  First time:   powershell -ExecutionPolicy Bypass -File KalavaraTallyLink.ps1 -Install
                (copies itself to this PC, syncs now, then every 15 minutes)
  Check only:   ... -File KalavaraTallyLink.ps1 -Check     (reads Tally, sends nothing)
  Stop it:      ... -File KalavaraTallyLink.ps1 -Uninstall

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
$Agent    = 'tally-link-ps 1.0'

$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$Home_ = Join-Path $env:LOCALAPPDATA 'KalavaraTallyLink'
$TaskName = 'Kalavara Tally Link'
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
  $name = 'KalaLink' + $type
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
  # 1. ledgers with their group and balances (Tally: negative = debit)
  $x = Get-TallyCollection 'Ledger' 'NAME,PARENT,OPENINGBALANCE,CLOSINGBALANCE,PARTYGSTIN'
  $ledgers = @()
  foreach ($l in (Nodes $x.ENVELOPE.BODY.DATA.COLLECTION 'LEDGER')) {
    $ledgers += @{ name = (NameOf $l); group = (Txt $l 'PARENT'); opening = (Num (Txt $l 'OPENINGBALANCE'));
                   closing = (Num (Txt $l 'CLOSINGBALANCE')); gstin = (Txt $l 'PARTYGSTIN') }
  }
  # 2. stock items with closing quantity and value
  $x = Get-TallyCollection 'StockItem' 'NAME,PARENT,BASEUNITS,CLOSINGBALANCE,CLOSINGVALUE'
  $items = @()
  foreach ($i in (Nodes $x.ENVELOPE.BODY.DATA.COLLECTION 'STOCKITEM')) {
    $items += @{ name = (NameOf $i); group = (Txt $i 'PARENT'); unit = (Txt $i 'BASEUNITS');
                 qty = (Num (Txt $i 'CLOSINGBALANCE')); value = (Num (Txt $i 'CLOSINGVALUE')) }
  }
  # 3. vouchers from the last $Days days, with their ledger lines
  $toD = Get-Date; $fromD = $toD.AddDays(-$Days)
  $from = $fromD.ToString('d-MMM-yyyy', [Globalization.CultureInfo]::InvariantCulture)
  $to   = $toD.ToString('d-MMM-yyyy', [Globalization.CultureInfo]::InvariantCulture)
  $x = Get-TallyCollection 'Voucher' 'DATE,VOUCHERTYPENAME,VOUCHERNUMBER,PARTYLEDGERNAME,NARRATION,GUID,ALLLEDGERENTRIES.LIST,LEDGERENTRIES.LIST' $from $to
  $vouchers = @()
  foreach ($v in (Nodes $x.ENVELOPE.BODY.DATA.COLLECTION 'VOUCHER')) {
    $lines = @()
    foreach ($e in (Nodes $v 'ALLLEDGERENTRIES.LIST') + (Nodes $v 'LEDGERENTRIES.LIST')) {
      $ln = Txt $e 'LEDGERNAME'
      if ($ln) { $lines += @{ ledger = $ln; amount = (Num (Txt $e 'AMOUNT')) } }
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

function Send-ToKalavara($payload) {
  $json = $payload | ConvertTo-Json -Depth 6 -Compress
  $res = Invoke-RestMethod -Uri $CoreUrl -Method Post -Body ([Text.Encoding]::UTF8.GetBytes($json)) `
           -ContentType 'text/plain; charset=utf-8' -TimeoutSec 300
  return $res
}

function Tell-Problem([string]$msg) {
  try { Send-ToKalavara @{ action = 'tallyProblem'; key = $LinkKey; message = $msg } | Out-Null } catch { }
}

# ---------------- install / uninstall ----------------
if ($Uninstall) {
  schtasks.exe /Delete /TN $TaskName /F 2>$null | Out-Null
  Write-Log 'Stopped: automatic sync removed.'
  exit 0
}
if ($Install) {
  $target = Join-Path $Home_ 'KalavaraTallyLink.ps1'
  if ($PSCommandPath -ne $target) { Copy-Item -Path $PSCommandPath -Destination $target -Force }
  $cmd = 'powershell.exe -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "' + $target + '"'
  schtasks.exe /Create /SC MINUTE /MO $Every /TN $TaskName /TR $cmd /F | Out-Null
  Write-Log ('Installed: syncing every ' + $Every + ' minutes while you are signed in to Windows.')
}

# ---------------- one sync ----------------
try {
  Write-Log ('Reading Tally (' + $Company + ')...')
  $data = Read-Tally
  Write-Log ('Found ' + $data.ledgers.Count + ' ledgers, ' + $data.items.Count + ' stock items, ' + $data.vouchers.Count + ' vouchers.')
  if ($Check) { Write-Log 'Check only: nothing sent.'; exit 0 }
  $payload = @{ action = 'tallyPush'; key = $LinkKey; company = $Company; agent = $Agent;
                from = $data.from; to = $data.to; ledgers = $data.ledgers; items = $data.items; vouchers = $data.vouchers }
  $res = Send-ToKalavara $payload
  if ($res.ok) {
    Write-Log 'Sent to Kalavara.'
    if ($res.nameMatches -eq $false) { Write-Log 'Note: the company name in Tally differs from the one in Kalavara.' }
  } else {
    Write-Log ('Kalavara said: ' + $res.message)
  }
} catch {
  $m = $_.Exception.Message
  if ($m -match 'Unable to connect|actively refused|No connection') { $m = "Couldn't reach Tally. Is Tally open with " + $Company + ' loaded, and is its connection on port 9000 switched on?' }
  Write-Log ('Problem: ' + $m)
  if (-not $Check) { Tell-Problem $m }
  exit 1
}
