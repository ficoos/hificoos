import { Hub } from 'tab-election/hub';
import { DatabaseService } from './database-service';

new Hub(
	(hub) => {
		hub.register(new DatabaseService());
	},
	'hificoos-db', // lock/namespace,
	'1' // version, bump on breaking worker changes
);
