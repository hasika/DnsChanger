const os = require('os'),
    fs = require('fs'),
    shell = require('shelljs'),
    cmd = require('node-cmd'),
    network = require('network'),
    version = require('../package.json').version,
    sudo = require('sudo-prompt');

shell.config.silent = true;

let macOSignoreInterfaces = ['iPhone USB', 'Bluetooth PAN', 'Thunderbolt Bridge', 'lo0', ''],
    logging = true;

function _getExecutionOutput(command) {
    // return output of a command
    return new Promise((resolve) => {
        cmd.get(command, function(err, data) {
            _logging(`command output: ${data}`);
            resolve(true);
        });
    });
}

function _determinePowershellOrNetsh() {
    // if version is Windows 7 or below use netsh
    let releaseVer = os.release().split('.');
    if (parseInt(releaseVer[0]) <= 6 && parseInt(releaseVer[1]) <= 1 || (parseInt(releaseVer[0]) === 5)) {
        // use netsh
        _logging('Using netsh for DNS configuration');
        return true;
    }
    // use powershell
    _logging('Using powershell for DNS configuration');
    return false;
}

function _logging(text) {
    console.log(`[node_dns_changer]: ${text}`);
}

function _formatDNSServerAddresses(DNSservers) {
    // if input is a string, convert it to an array of strings
    if (typeof DNSservers === 'string') {
        if ((" " in DNSservers)) return DNSservers.split(' ');
        else {
            throw "[node_dns_changer:validation]: A space must be in DNSservers if it's a string";
        }
    }
    else if (typeof DNSservers === 'object') return DNSservers;
}

function _checkVars({DNSservers, DNSbackupName, loggingEnable, mkBackup, macOSuseDHCP, windowsPreferNetsh}) {
    if (typeof DNSservers !== 'object' && typeof DNSservers !== 'undefined') {
        throw "[node_dns_changer:validation]: DNSservers must be an object";
    }

    if (typeof DNSservers === 'object') DNSservers.map((i) => {
        if (typeof i !== 'string' || !((/^(?!0)(?!.*\.$)((1?\d?\d|25[0-5]|2[0-4]\d)(\.|$)){4}$/.test(i) === true) || /(([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]+|::(ffff(:0{1,4})?:)?((25[0-5]|(2[0-4]|1?[0-9])?[0-9])\.){3}(25[0-5]|(2[0-4]|1?[0-9])?[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1?[0-9])?[0-9])\.){3}(25[0-5]|(2[0-4]|1?[0-9])?[0-9]))/.test(i) === true)) {
            throw "[node_dns_changer:validation]: DNSservers[*] each must be strings and valid IPv4 addresses";
        }
    });

    if (typeof DNSbackupName !== 'string') {
        throw "[node_dns_changer:validation]: DNSbackupName must be a string";
    }

    if (typeof macOSuseDHCP !== 'boolean' && typeof macOSuseDHCP !== 'undefined') {
        throw "[node_dns_changer:validation]: macOSuseDHCP must be a boolean";
    }

    if (typeof loggingEnable !== 'boolean') {
        throw "[node_dns_changer:validation]: loggingEnable must be a boolean";
    }

    if (typeof mkBackup !== 'boolean' && typeof mkBackup !== 'undefined') {
        throw "[node_dns_changer:validation]: mkBackup must be a boolean";
    }

    if (typeof rmBackup !== 'boolean' && typeof rmBackup !== 'undefined') {
        throw "[node_dns_changer:validation]: rmBackup must be a boolean";
    }

    if (typeof windowsPreferNetsh !== 'boolean' && typeof windowsPreferNetsh !== 'undefined') {
        throw "[node_dns_changer:validation]: windowsPreferNetsh must be a boolean";
    }
}

exports.setDNSservers = function({DNSservers, DNSbackupName = "before-dns-changer", loggingEnable = true, mkBackup = true, windowsPreferNetsh = false}) {
    // set a DNS per platform
    if (_checkVars({DNSservers, DNSbackupName, loggingEnable, mkBackup}) === false) {
        return;
    }
    DNSservers = _formatDNSServerAddresses(DNSservers);
    return new Promise((resolve, reject) => {
        logging = loggingEnable;
        _logging(`Setting DNS servers: '${DNSservers}'`);
        if (DNSservers === undefined) throw "You must include two DNS server addresses";
        switch(os.platform()) {
            case 'linux':
                if (os.userInfo().uid !== 0) {
                    resolve(false);
                    reject("ERROR: User must be root to change DNS settings");
                    return;
                }
                if (mkBackup === true) {
                    // move resolv.conf to another location
                    _logging("Backing up resolv.conf");
                    shell.cp('-f','/etc/resolv.conf', `/etc/resolv.conf.${DNSbackupName}`);
                    resolve(false);
                }
                _logging("Writing resolv.conf");
                // write new DNS server config
                fs.writeFile('/etc/resolv.conf', `#GENERATED BY node_dns_changer, backed up to '/etc/resolv.conf.${DNSbackupName}'\nnameserver ${DNSservers[0]}\nnameserver ${DNSservers[1]}\n`, function (err) {
                    if (err) throw err;
                    _logging("Backed up DNS.");
                    resolve(false);
                });
                _logging("Changing permissions");
                // make resolv.conf immutable
                shell.exec('chattr +i /etc/resolv.conf');
                _logging("Flushing DNS cache (if systemd-resolve is available).");
                // flush DNS cache
                shell.exec('which systemd-resolve 2> /dev/null && systemd-resolve --flush-caches');
                shell.exec('systemctl is-active --quiet nscd && service nscd reload && service nscd restart');
                resolve(true);
                break;

            case 'darwin':
                // get interfaces
                cmd.get('networksetup -listallnetworkservices | sed 1,1d', function(err, data) {
                    let interfaces = data;
                    interfaces = interfaces.split('\n');
                    if (mkBackup === true) {
                        _logging("Backing up current DNS servers");
                        // back up current DNS server addresses
                        _getExecutionOutput(`scutil --dns | grep 'nameserver\[[0-9]*\]' | head -n 1 | tail -n 1 | cut -d ':' -f2 > /Library/Caches/${DNSbackupName}.txt`);
                        _getExecutionOutput(`scutil --dns | grep 'nameserver\[[0-9]*\]' | head -n 2 | tail -n 1 | cut -d ':' -f2 >> /Library/Caches/${DNSbackupName}.txt`);
                    }
                    for (let x in interfaces) {
                        // set DNS servers, per interface
                        if (!(macOSignoreInterfaces.indexOf(interfaces[x]) > -1)) {
                            _logging(`Setting interface '${interfaces[x]}' using: networksetup -setdnsservers ${interfaces[x]} ${DNSservers.join(' ')}`);
                            // _getExecutionOutput(`networksetup -setdnsservers ${interfaces[x]} ${DNSservers.join(' ')}`);
                            sudo.exec(`networksetup -setdnsservers ${interfaces[x]} ${DNSservers}`, {name: 'Electron'}, function(error, stdout, stderr) {
                                if (error) throw error;
                                console.log('stdout: ' + stdout);
                            });
                        }
                        else {
                            _logging(`Ignoring interface: ${interfaces[x]}`);
                        }
                    }
                    resolve(true);
                });
                break;

            case 'win32':
                // check if user is admin
                require('is-admin')().then(admin => {
                    if (admin === false) {
                        throw "Administator privilege are required to change DNS settings";
                    }
                });
                // get interfaces
                let interfaces;
                network.get_interfaces_list(function(err, obj) {
                    interfaces = obj;
                    _logging(`INTERFACES: ${JSON.stringify(interfaces)}`);
                    for (let x in interfaces) {
                        // set DNS servers per ethernet interface
                        _logging(`Setting ethernet interface: ${interfaces[x].name}`);
                        if (_determinePowershellOrNetsh() || windowsPreferNetsh === true) {
                            _logging(`Setting interface '${interfaces[x].name}' using: netsh interface ipv4 set dns name="${interfaces[x].name}" static "${DNSservers[0]}" primary`);
                            _getExecutionOutput(`netsh interface ipv4 set dns name="${interfaces[x].name}" static "${DNSservers[0]}" primary`);
                            _logging(`Setting interface '${interfaces[x].name}' using: netsh interface ipv4 add dns name="${interfaces[x].name}" "${DNSservers[1]}" index=2`);
                            _getExecutionOutput(`netsh interface ipv4 add dns name="${interfaces[x].name}" "${DNSservers[1]}" index=2`);
                        } else {
                            _logging(`Setting interface '${interfaces[x]}' using: powershell Set-DnsClientServerAddress -InterfaceAlias '${interfaces[x].name}' -ServerAddresses '${DNSservers[0]},${DNSservers[1]}'`);
                            _getExecutionOutput(`powershell Set-DnsClientServerAddress -InterfaceAlias '${interfaces[x].name}' -ServerAddresses '${DNSservers[0]},${DNSservers[1]}'`);
                        }
                    }
                    _logging("Flushing DNS cache.");
                    // flush DNS cache
                    _getExecutionOutput('ipconfig /flushdns');
                    resolve(true);
                });
                break;

            default:
                _logging("Error: Unsupported platform. ");
                resolve(false);
        }
    });
};

exports.restoreDNSservers = function({DNSbackupName = "before-dns-changer", loggingEnable = false, rmBackup = false, macOSuseDHCP = true, windowsPreferNetsh = false}) {
    // restore DNS from backup per platform
    if (_checkVars({DNSbackupName, loggingEnable, rmBackup, macOSuseDHCP, windowsPreferNetsh}) === false) {
        return;
    }
    return new Promise((resolve, reject) => {
        logging = loggingEnable;
        switch(os.platform()) {
            case 'linux':
                if (os.userInfo().uid !== 0) throw "ERROR: User must be root to change DNS settings";
                _logging("Changing permissions");
                // make mutable
                if (shell.exec('chattr -i /etc/resolv.conf').code !== 0) {
                    _logging("Could not make '/etc/resolv.conf' mutable");
                    resolve(false);
                    reject("Could not make '/etc/resolv.conf' mutable");
                    return;
                }
                _logging("Moving resolv.conf");
                // check if resolv.conf exists
                if (shell.test('-f', `/etc/resolv.conf.${DNSbackupName}`) !== true) {
                    _logging(`Could not find backed up settings '/etc/resolv.conf.${DNSbackupName}'.`);
                    resolve(false);
                    return;
                }

                _logging("Found backed up resolv file.");

                // copy backup to resolv.conf
                _logging("Restoring backup.");
                if (shell.rm('-f', '/etc/resolv.conf').code !== 0) {
                    _logging("Failed to remove current '/etc/resolv.conf'");
                    resolve(false);
                    return;
                }

                if (shell.cp('-f',`/etc/resolv.conf.${DNSbackupName}`, '/etc/resolv.conf').code !== 0) {
                    _logging("Failed to restore backup.");
                    resolve(false);
                    return;
                }

                if (rmBackup === true) {
                    _logging(`Removing backup '/etc/resolv.conf.${DNSbackupName}'.`);
                    shell.rm(`/etc/resolv.conf.${DNSbackupName}`);
                }

                // flush DNS cache
                _logging("Flushing resolve cache");
                shell.exec('which systemd-resolve 2> /dev/null && systemd-resolve --flush-caches');
                shell.exec('systemctl is-active --quiet nscd && service nscd reload && service nscd restart');
                resolve(true);
                break;

            case 'darwin':
                // check if backup file exists
                let DNSservers;
                if (macOSuseDHCP === false) {
                    if (shell.test('-f', `/Library/Caches/${DNSbackupName}.txt`)) {
                        _logging("Found backed up DNS file.");
                        DNSservers = shell.cat(`/Library/Caches/${DNSbackupName}.txt`).stdout;
                        DNSservers = DNSservers.split('\n');
                        DNSservers = DNSservers.join(' ');
                    }
                    else {
                        if (logging === true) throw "Could not find backed up DNS file.";
                    }
                }
                else if (macOSuseDHCP === true) DNSservers = "\"Empty\"";
                // get network interfaces
                cmd.get('networksetup -listallnetworkservices | sed 1,1d', function(err, data) {
                    let interfaces = data;
                    interfaces = interfaces.split('\n');
                    if ('\n' in interfaces) interfaces = interfaces.split('\n');
                    _logging("Restoring DNS servers");
                    for (let x in interfaces) {
                        // restore backed up server addresses per interface
                        if (!(macOSignoreInterfaces.indexOf(interfaces[x]) > -1)) {
                            _logging(`Setting interface '${interfaces[x]}' using: networksetup -setdnsservers ${interfaces[x]} ${DNSservers}`);
                            _getExecutionOutput(`networksetup -setdnsservers ${interfaces[x]} ${DNSservers}`);
                        }
                        else {
                            _logging(`Ignoring interface: ${interfaces[x]}`);
                        }
                    }
                    // remove backup
                    if (rmBackup === true) shell.rm(`/Library/Caches/${DNSbackupName}.txt`);
                    resolve(true);
                });
                break;

            case 'win32':
                // check if user is admin
                require('is-admin')().then(admin => {
                    if (admin === false) {
                        throw "Administator privilege are required to change DNS settings";
                    }
                });
                // get interfaces
                let interfaces;
                network.get_interfaces_list(function(err, obj) {
                    interfaces = obj;
                    _logging(`INTERFACES: ${JSON.stringify(interfaces)}`);
                    for (let x in interfaces) {
                        // set DNS servers per ethernet interface
                        _logging(`Setting ethernet interface: ${interfaces[x].name}`);
                        if (_determinePowershellOrNetsh() || windowsPreferNetsh === true) {
                            _logging(`Setting interface '${interfaces[x].name}' using: netsh interface ipv4 set dns name="${interfaces[x].name}" dhcp`);
                            _getExecutionOutput(`netsh interface ipv4 set dns name="${interfaces[x].name}" dhcp`);
                        } else {
                            _logging(`Setting interface '${interfaces[x].name}' using: powershell Set-DnsClientServerAddress -InterfaceAlias "${interfaces[x].name}" -ResetServerAddresses`);
                            _getExecutionOutput(`powershell Set-DnsClientServerAddress -InterfaceAlias "${interfaces[x].name}" -ResetServerAddresses`);
                        }
                    }
                    _logging("Flushing DNS cache.");
                    // flush DNS cache
                    _getExecutionOutput('ipconfig /flushdns');
                });
                resolve(true);
                break;

            default:
                _logging("Error: Unsupported platform.");
                resolve(false);
        }
    });
};

exports.version = version;
