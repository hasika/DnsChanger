const { app, Menu, Tray, shell } = require('electron');

let servers = require("./dns_servers.json");
const electronUtils = require('electron-util');
const dns_changer = require('node_dns_changer');
const { resolve: resolvePath } = require('app-root-path');

let domain_name_servers = [
    // DNS Options
    {
        label: 'Domin name servers',
        type: 'normal',
        enabled: false,
    },
];

servers.forEach((dns) => {

    let servers = "[";
    dns.servers.forEach((server, index) => {
        servers += ` ${server} `;
        if (index < dns.servers.length - 1){
            servers += ",";
        }
    });
    servers += "]";

    domain_name_servers.push({
        label: `${dns.name} ${servers}`,
        type: 'radio',
        click: () => {
            dns_changer.setDNSservers({ DNSservers: dns.servers }).then(response => {
                console.log(response);
                console.log("Clicked: ", dns);
            }).catch(err => {
                console.log("Catched: ", err);
            });
        }
    });

});

app.on('ready', () => {

    electronUtils.enforceMacOSAppLocation();

    app.name = 'DNS Changer';
    app.dock.hide();

    let tray;

    // Create Tray
    try {
        const iconName = electronUtils.is.windows ? 'tray-windows' : 'trayTemplate';
        tray = new Tray(resolvePath(`./tray/${iconName}.png`));
        tray.setToolTip('DNS Changer')
    } catch (err) {
        console.log(err);
        // we can log errors like this on sentry.io
        return
    }

    const contextMenu = Menu.buildFromTemplate([
        { label: 'Add new one' },
        { type: 'separator' },
        { type: 'separator' },
        ...domain_name_servers,
        { type: 'separator' },
        { label: 'Preferences'},
        { label: 'Open at login', type: "checkbox", checked: true },
        { type: 'separator' },
        { label: 'About Menubar Dns Changer', role: 'about' },
        {
            role: 'help',
            submenu: [
                {
                    label: 'Open documentations website page!',
                    click: () => {
                        shell.openExternal('https://alirezaj.ir/menubar-dns-changer/docs');
                    }
                },
                {
                    label: 'Open github page!',
                    click: () => {
                        shell.openExternal('https://github.com/MrJoshLab');
                    }
                }
            ]
        },
        { label: 'Quit', role: 'quit' }
    ]);

    tray.setContextMenu(contextMenu);

});